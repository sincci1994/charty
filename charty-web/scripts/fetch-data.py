# 데이터 수집기: 캔들 + 경제지표 + 뉴스 → public/data/*.json
# 사용법: python scripts/fetch-data.py
#   POLYGON_API_KEY 있으면 5m/15m/30m을 2년치로 (없으면 yfinance 60일 fallback)
#   FRED_API_KEY 있으면 지표 발표일을 실제 최초 발표일로 (없으면 근사치 fallback)
import json
import os
import time
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from pathlib import Path

import pandas as pd
import requests
import yfinance as yf

TICKERS = ["QQQ", "SPY", "AAPL", "NVDA", "TSLA", "MSFT"]
OUT = Path(__file__).resolve().parent.parent / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)
POLY_KEY = os.environ.get("POLYGON_API_KEY")
FRED_KEY = os.environ.get("FRED_API_KEY")

OHLCV = {"Open": "first", "High": "max", "Low": "min", "Close": "last", "Volume": "sum"}
counts = {}  # TF별 최소 캔들 수 → candle-counts.json (data.ts의 MAX_BARS 계산에 사용)


def dump(df, symbol, tf):
    df = df.dropna()
    rows = [
        [int(ts.timestamp()), round(float(o), 4), round(float(h), 4),
         round(float(l), 4), round(float(c), 4), int(v)]
        for ts, o, h, l, c, v in zip(
            df.index, df["Open"], df["High"], df["Low"], df["Close"], df["Volume"])
    ]
    (OUT / f"{symbol}_{tf}.json").write_text(json.dumps(rows, separators=(",", ":")))
    counts[tf] = min(counts.get(tf, 10**9), len(rows))
    print(f"{symbol}_{tf}: {len(rows)} candles")


# Polygon 무료 티어: 2년 분봉, 5req/min. splits만 조정(yfinance는 배당까지) — 훈련용 오차 허용
def polygon_5m(sym):
    frm = (pd.Timestamp.now(tz="UTC") - pd.Timedelta(days=729)).date()
    to = pd.Timestamp.now(tz="UTC").date()
    url = f"https://api.polygon.io/v2/aggs/ticker/{sym}/range/5/minute/{frm}/{to}"
    params = {"adjusted": "true", "sort": "asc", "limit": 50000, "apiKey": POLY_KEY}
    results = []
    while url:
        r = requests.get(url, params=params, timeout=60).json()
        results += r.get("results", [])
        url = r.get("next_url")
        params = {"apiKey": POLY_KEY}
        time.sleep(13)  # ponytail: 5req/min 제한 — 페이지·종목 간 일괄 13초 대기
    df = pd.DataFrame(results)
    idx = pd.to_datetime(df["t"], unit="ms", utc=True).dt.tz_convert("America/New_York")
    df = df.set_index(idx).rename(columns={"o": "Open", "h": "High", "l": "Low", "c": "Close", "v": "Volume"})
    df = df.between_time("09:30", "15:55")  # 프리·애프터 제외, 정규장 시작봉만 (78개/일)
    return df[["Open", "High", "Low", "Close", "Volume"]]


for sym in TICKERS:
    t = yf.Ticker(sym)
    m5 = polygon_5m(sym) if POLY_KEY else t.history(period="60d", interval="5m")
    dump(m5, sym, "5m")
    # ponytail: 15m/30m은 5m 리샘플 (yfinance 직접 수집도 60일 제한이라 이득 없음)
    dump(m5.resample("15min").agg(OHLCV).dropna(), sym, "15m")
    dump(m5.resample("30min").agg(OHLCV).dropna(), sym, "30m")
    h1 = t.history(period="730d", interval="1h")
    dump(h1, sym, "1h")
    # ponytail: yfinance에 4h가 없어 1h를 리샘플
    dump(h1.resample("4h").agg(OHLCV).dropna(), sym, "4h")
    dump(t.history(period="20y", interval="1d"), sym, "1d")
    dump(t.history(period="20y", interval="1wk"), sym, "1w")

(OUT / "tickers.json").write_text(json.dumps(TICKERS))
(OUT / "candle-counts.json").write_text(json.dumps(counts))
print("candle-counts.json:", counts)


# ── 경제지표 (FRED fredgraph.csv — API 키 불필요) ──────────────────────────
FRED = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={}"
DAY = 86400


def fred(series):
    df = pd.read_csv(FRED.format(series), na_values=".")
    df.columns = ["date", "value"]
    df["date"] = pd.to_datetime(df["date"])
    return df.dropna()


# ALFRED: output_type=4 → 관측치별 최초 발표(realtime_start = 실제 첫 발표일)
def release_dates(series_id):
    if not FRED_KEY:
        return {}
    r = requests.get("https://api.stlouisfed.org/fred/series/observations",
                     params={"series_id": series_id, "api_key": FRED_KEY,
                             "file_type": "json", "output_type": 4},
                     timeout=60).json()
    return {o["date"]: o["realtime_start"] for o in r["observations"]}


def points(df, lag_days, rel=None):
    out = []
    for d, v in zip(df["date"], df["value"]):
        r = rel.get(d.strftime("%Y-%m-%d")) if rel else None
        if r:
            # 실제 발표일 08:30 ET (CPI 등 주요 지표 발표 시각) — ponytail: DST는 pandas가 처리
            ts = int(pd.Timestamp(f"{r} 08:30", tz="America/New_York").timestamp())
        else:
            ts = int(d.timestamp()) + lag_days * DAY  # vintage 없는 옛 구간 근사 fallback
        out.append([ts, round(float(v), 2)])
    return out


def yoy(series):
    df = fred(series)
    df["value"] = (df["value"] / df["value"].shift(12) - 1) * 100  # 전년비 %
    return df.dropna()


dff = fred("DFF")
dff_m = dff.set_index("date").resample("ME").last().dropna().reset_index()  # 월말 실효금리

payems = fred("PAYEMS")
payems["value"] = payems["value"].diff()  # 월간 증감 (천 명)
payems = payems.dropna()

rel_cpi = release_dates("CPIAUCSL")
if rel_cpi:
    assert rel_cpi.get("2024-06-01") == "2024-07-11", f"CPI 발표일 검증 실패: {rel_cpi.get('2024-06-01')}"

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
fng_raw = requests.get("https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
                       headers=FNG_HDRS, timeout=30).json()["fear_and_greed_historical"]["data"]
fng = pd.Series({pd.to_datetime(int(p["x"]), unit="ms"): float(p["y"]) for p in fng_raw}).resample("W").last().dropna()
fng_pts = [[int(ts.timestamp()), round(float(v), 1)] for ts, v in fng.items()]

econ = [
    {"id": "FFR", "label": "기준금리(실효)", "unit": "%", "data": points(dff_m, 0)},
    {"id": "CPI", "label": "CPI 전년비", "unit": "%", "data": points(yoy("CPIAUCSL"), 45, rel_cpi)},
    {"id": "PCE", "label": "PCE 물가 전년비", "unit": "%", "data": points(yoy("PCEPI"), 58, release_dates("PCEPI"))},
    {"id": "PPI", "label": "PPI 전년비", "unit": "%", "data": points(yoy("PPIACO"), 14, release_dates("PPIACO"))},
    {"id": "UNEMP", "label": "실업률", "unit": "%", "data": points(fred("UNRATE"), 37, release_dates("UNRATE"))},
    {"id": "NFP", "label": "비농업 고용 증감", "unit": "천 명", "data": points(payems, 37, release_dates("PAYEMS"))},
    {"id": "M2", "label": "M2 증가율(전년비)", "unit": "%", "data": points(yoy("M2SL"), 28, release_dates("M2SL"))},
    {"id": "VIX", "label": "VIX 변동성지수", "unit": "", "data": weekly("^VIX")},
    {"id": "NDX", "label": "나스닥 100", "unit": "", "data": weekly("^NDX")},
    {"id": "GOLD", "label": "금 선물 (온스)", "unit": "$", "data": weekly("GC=F")},
    {"id": "JPY", "label": "엔/달러", "unit": "¥", "data": weekly("JPY=X")},
    {"id": "WTI", "label": "WTI 유가", "unit": "$", "data": weekly("CL=F")},
    {"id": "KOSPI", "label": "코스피", "unit": "", "data": weekly("^KS11")},
    {"id": "KOSDAQ", "label": "코스닥", "unit": "", "data": weekly("^KQ11")},
    {"id": "KRW", "label": "원/달러", "unit": "₩", "data": weekly("KRW=X")},
    {"id": "FNG", "label": "공포·탐욕지수", "unit": "", "data": fng_pts},  # CNN, 최근 ~3년만 제공
    # ponytail: FOMC 점도표(SEP 금리 전망)는 과거 시점별 vintage가 필요해 ALFRED 연동 때 추가
]
(OUT / "econ.json").write_text(json.dumps(econ, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("econ.json:", {e["id"]: len(e["data"]) for e in econ})


# ── 뉴스 헤드라인 (RSS — 홈 화면용 스냅샷, 재실행 시 갱신) ─────────────────
def rss(url, source, n=8):
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
    return items[:n]


news = {
    "fetchedAt": int(time.time()),
    "kr": rss("https://www.hankyung.com/feed/economy", "한국경제"),
    "us": rss("https://www.cnbc.com/id/100003114/device/rss/rss.html", "CNBC"),
}
(OUT / "news.json").write_text(json.dumps(news, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
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
            if r.status_code == 429:  # 스로틀 — 지수 백오프 후 재시도
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
week = (pd.Timestamp(max(p[0] for p in old), unit="s", tz="UTC").normalize() + pd.Timedelta(days=7)
        if old else pd.Timestamp("2017-01-02", tz="UTC"))
now = pd.Timestamp.now(tz="UTC")
archive = old
while week < now:
    got = gdelt_week(week)
    if got is None:  # 차단 지속 — 진행분 저장 후 중단, 다음 실행이 이 주부터 이어받음
        print("GDELT 429 지속 — 진행분 저장 후 중단:", week.date())
        break
    archive += got
    week += pd.Timedelta(days=7)
    time.sleep(10)  # GDELT 제한(5초당 1요청)에 여유를 둠 — 최초 실행 ~1.5시간
archive.sort(key=lambda p: p[0])
(OUT / "news-archive.json").write_text(
    json.dumps(archive, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("news-archive.json:", len(archive), "headlines")
print("done ->", OUT)
