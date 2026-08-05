# 데이터 수집기: 캔들 + 경제지표 + 뉴스 → public/data/*.json (+ Supabase Storage 업로드)
# 사용법: python scripts/fetch-data.py
#   환경변수 SUPABASE_URL·SUPABASE_SERVICE_KEY가 있으면 Storage 버킷 `data`에도 업로드 (CI용).
#   없으면 로컬 저장만 — 기존과 동일하게 동작.
# 15m/30m/4h은 저장하지 않음 — 앱이 5m/1h를 로드해 리샘플 (data.ts loadCandles)
import json
import os
import sys
import time
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from pathlib import Path

import pandas as pd
import requests
import yfinance as yf

sys.stdout.reconfigure(encoding="utf-8")  # Windows 콘솔(cp949)에서 한글·특수문자 print 크래시 방지

TICKERS = ["QQQ", "SPY", "AAPL", "NVDA", "TSLA", "MSFT"]
OUT = Path(__file__).resolve().parent.parent / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
if SUPABASE_URL and not SUPABASE_KEY:  # 반쪽 설정(시크릿 누락·오타)은 첫 업로드에서 불투명하게 죽음 — 즉시 명확하게
    raise SystemExit("SUPABASE_URL set but SUPABASE_SERVICE_KEY missing")
print("storage upload:", "ON" if SUPABASE_URL else "OFF (SUPABASE_URL 미설정 — 로컬 저장만)")


def save(name, text):
    """로컬 저장 + (키 있으면) Supabase Storage `data` 버킷 업로드"""
    (OUT / name).write_text(text, encoding="utf-8")
    if not SUPABASE_URL:
        return
    for i in range(3):  # 일시적 5xx 1회로 런 전체(최악: GDELT 백필 ~1.5h)가 날아가지 않게 재시도
        try:
            requests.put(
                f"{SUPABASE_URL}/storage/v1/object/data/{name}", data=text.encode("utf-8"),
                headers={"Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json",
                         "x-upsert": "true", "cache-control": "max-age=3600"},
                timeout=60,
            ).raise_for_status()
            return
        except requests.RequestException:
            if i == 2:
                raise
            time.sleep(5 * (i + 1))


counts = {}  # TF별 최소 캔들 수 → candle-counts.json (data.ts의 MAX_BARS 계산에 사용)


def dump(df, symbol, tf):
    df = df.dropna()
    if df.empty:  # yfinance는 스로틀 시 예외 없이 빈 DF 반환 — 빈 파일·counts=0으로 좋은 데이터 덮어쓰기 방지
        raise SystemExit(f"{symbol}_{tf}: empty from yfinance — aborting")
    rows = [
        [int(ts.timestamp()), round(float(o), 4), round(float(h), 4),
         round(float(l), 4), round(float(c), 4), int(v)]
        for ts, o, h, l, c, v in zip(
            df.index, df["Open"], df["High"], df["Low"], df["Close"], df["Volume"])
    ]
    save(f"{symbol}_{tf}.json", json.dumps(rows, separators=(",", ":")))
    counts[tf] = min(counts.get(tf, 10**9), len(rows))
    print(f"{symbol}_{tf}: {len(rows)} candles")


for sym in TICKERS:
    t = yf.Ticker(sym)
    dump(t.history(period="60d", interval="5m"), sym, "5m")  # yfinance 분봉 제한 60일
    dump(t.history(period="730d", interval="1h"), sym, "1h")
    dump(t.history(period="20y", interval="1d"), sym, "1d")
    dump(t.history(period="20y", interval="1wk"), sym, "1w")

save("tickers.json", json.dumps(TICKERS))
save("candle-counts.json", json.dumps(counts))
print("candle-counts.json:", counts)


# ── 경제지표 (FRED fredgraph.csv — API 키 불필요) ──────────────────────────
FRED = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={}"


def fred(series):
    df = pd.read_csv(FRED.format(series), na_values=".")
    df.columns = ["date", "value"]
    df["date"] = pd.to_datetime(df["date"])
    return df.dropna()


# 발표 시점 = 관측일 + 평균 발표 지연(lag_days) 근사
def points(df, lag_days):
    return [[int(d.timestamp()) + lag_days * 86400, round(float(v), 2)]
            for d, v in zip(df["date"], df["value"])]


def yoy(series):
    df = fred(series)
    df["value"] = (df["value"] / df["value"].shift(12) - 1) * 100  # 전년비 %
    return df.dropna()


dff = fred("DFF")
dff_m = dff.set_index("date").resample("ME").last().dropna().reset_index()  # 월말 실효금리

payems = fred("PAYEMS")
payems["value"] = payems["value"].diff()  # 월간 증감 (천 명)
payems = payems.dropna()


# 주간 종가 시리즈 (VIX·주요지수): 시장이 실시간으로 아는 값 — 발표 지연 없음
def weekly(ticker):
    s = yf.Ticker(ticker).history(period="20y", interval="1d")["Close"].resample("W").last().dropna()
    return [[int(ts.timestamp()), round(float(v), 2)] for ts, v in s.items()]


# 공포·탐욕지수 (CNN 비공식 graphdata — Referer/Origin 없으면 봇 차단됨)
FNG_HDRS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
    "Accept": "application/json",
    "Referer": "https://www.cnn.com/markets/fear-and-greed",
    "Origin": "https://www.cnn.com",
}
try:
    fng_raw = requests.get("https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
                           headers=FNG_HDRS, timeout=30).json()["fear_and_greed_historical"]["data"]
    fng = pd.Series({pd.to_datetime(int(p["x"]), unit="ms"): float(p["y"]) for p in fng_raw}).resample("W").last().dropna()
    fng_pts = [[int(ts.timestamp()), round(float(v), 1)] for ts, v in fng.items()]
except (ValueError, KeyError, requests.RequestException):
    fng_pts = []  # CNN 봇차단은 데이터센터 IP에서 상시 리스크 — FNG만 비우고 나머지 econ은 계속 (홈은 빈 FNG 카드 숨김)

econ = [
    {"id": "FFR", "data": points(dff_m, 0)},  # 기준금리(실효) %
    {"id": "CPI", "data": points(yoy("CPIAUCSL"), 45)},  # CPI 전년비 %
    {"id": "PCE", "data": points(yoy("PCEPI"), 58)},
    {"id": "PPI", "data": points(yoy("PPIACO"), 14)},
    {"id": "UNEMP", "data": points(fred("UNRATE"), 37)},  # 실업률 %
    {"id": "NFP", "data": points(payems, 37)},  # 비농업 고용 증감(천 명)
    {"id": "M2", "data": points(yoy("M2SL"), 28)},
    {"id": "VIX", "data": weekly("^VIX")},
    {"id": "NDX", "data": weekly("^NDX")},
    {"id": "GOLD", "data": weekly("GC=F")},
    {"id": "JPY", "data": weekly("JPY=X")},
    {"id": "WTI", "data": weekly("CL=F")},
    {"id": "KOSPI", "data": weekly("^KS11")},
    {"id": "KOSDAQ", "data": weekly("^KQ11")},
    {"id": "KRW", "data": weekly("KRW=X")},
    {"id": "FNG", "data": fng_pts},  # CNN 공포·탐욕지수, 최근 ~3년만 제공
]
save("econ.json", json.dumps(econ, ensure_ascii=False, separators=(",", ":")))
print("econ.json:", {e["id"]: len(e["data"]) for e in econ})


# ── 뉴스 헤드라인 (RSS — 홈 화면용 스냅샷, 재실행 시 갱신) ─────────────────
def rss(url, source):
    xml = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=30).text
    items = []
    for it in ET.fromstring(xml).iter("item"):
        title = (it.findtext("title") or "").strip()
        pub = it.findtext("pubDate")
        if title:
            items.append({
                "title": title, "source": source,
                "link": (it.findtext("link") or "").strip(),
                "ts": int(parsedate_to_datetime(pub).timestamp()) if pub else 0,
            })
    return items[:8]


news = {
    "fetchedAt": int(time.time()),
    "kr": rss("https://www.hankyung.com/feed/economy", "한국경제"),
    "us": rss("https://www.cnbc.com/id/100003114/device/rss/rss.html", "CNBC"),
}
save("news.json", json.dumps(news, ensure_ascii=False, separators=(",", ":")))
print("news.json:", {k: len(v) for k, v in news.items() if isinstance(v, list)})


# ── 뉴스 아카이브 (GDELT DOC 2.0, 키 불필요 — 시뮬 시점 매칭용, 2017년~) ────
# 주 단위 주요 헤드라인을 사전 생성해 정적 JSON화. 기존 파일이 있으면 이후 주만 이어받음(증분).
ARCHIVE = OUT / "news-archive.json"
SOURCES = {"reuters.com": "Reuters", "cnbc.com": "CNBC", "apnews.com": "AP"}
GDELT_Q = '("stock market" OR "Federal Reserve" OR inflation) (domain:reuters.com OR domain:cnbc.com OR domain:apnews.com) sourcelang:eng'


def gdelt_week(start):
    p = {"query": GDELT_Q, "mode": "artlist", "format": "json", "maxrecords": 8, "sort": "hybridrel",
         "startdatetime": start.strftime("%Y%m%d000000"),
         "enddatetime": (start + pd.Timedelta(days=7)).strftime("%Y%m%d000000")}
    for i in range(3):
        try:
            r = requests.get("https://api.gdeltproject.org/api/v2/doc/doc", params=p, timeout=30)
            if r.status_code == 429:  # 스로틀 — 지수 백오프 후 재시도 (마지막 시도면 잠만 자고 끝나니 바로 포기)
                if i == 2:
                    break
                time.sleep(60 * 2**i)
                continue
            arts = r.json().get("articles", [])
            out, seen = [], set()
            for a in arts:
                title = a.get("title", "").strip()
                dom = a.get("domain", "")
                if not title or title in seen or dom not in SOURCES:
                    continue
                seen.add(title)
                out.append([int(pd.Timestamp(a["seendate"]).timestamp()), title, SOURCES[dom]])
                if len(out) == 5:
                    break
            return out
        except (ValueError, requests.RequestException):
            time.sleep(10)  # 일시 오류 — 쉬고 재시도
    return None  # 3회 실패 — 차단 상태로 보고 중단 신호


old = json.loads(ARCHIVE.read_text(encoding="utf-8")) if ARCHIVE.exists() else []
if not old and SUPABASE_URL:  # CI는 매번 새 체크아웃 — Storage의 기존 아카이브를 이어받음
    r = requests.get(f"{SUPABASE_URL}/storage/v1/object/public/data/news-archive.json", timeout=60)
    if r.ok:
        old = r.json()
    elif r.status_code not in (400, 404):  # 400/404 = 아직 없음(첫 실행). 그 외(5xx 등)를 빈 것으로 취급하면
        raise SystemExit(f"archive resume GET failed: {r.status_code}")  # 전체 재백필→429 중단 시 부분본이 완본을 덮어씀

# 완결된 주만, 2017-01-02(월) 그리드에 정렬해 수집 — 부분 주를 수집하면 다음 실행이 그 주의 나머지를 영영 건너뜀
EPOCH = pd.Timestamp("2017-01-02", tz="UTC")
week = (EPOCH + pd.Timedelta(weeks=(pd.Timestamp(max(p[0] for p in old), unit="s", tz="UTC") - EPOCH).days // 7 + 1)
        if old else EPOCH)
now = pd.Timestamp.now(tz="UTC")
archive = old
while week + pd.Timedelta(days=7) <= now:
    got = gdelt_week(week)
    if got is None:  # 차단 지속 — 진행분 저장 후 중단, 다음 실행이 이 주부터 이어받음
        print("GDELT 429 지속 — 진행분 저장 후 중단:", week.date())
        break
    archive += got
    week += pd.Timedelta(days=7)
    time.sleep(10)  # GDELT 제한(5초당 1요청)에 여유를 둠 — 최초 실행 ~1.5시간
archive.sort(key=lambda p: p[0])
save("news-archive.json", json.dumps(archive, ensure_ascii=False, separators=(",", ":")))
print("news-archive.json:", len(archive), "headlines")
print("done ->", OUT)
