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
                headers={"Authorization": f"Bearer {SUPABASE_KEY}", "apikey": SUPABASE_KEY,  # sb_secret 키는 JWT가 아니라 apikey 헤더 필수
                         "Content-Type": "application/json", "x-upsert": "true", "cache-control": "max-age=3600"},
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


# ── 재무 (SEC EDGAR companyfacts, 키 불필요 — R10 재무 탭) ─────────────────
# point-in-time 원칙: 같은 기간의 중복 공시(10-K/A·비교표시)는 최초 filed만 채택 —
# filed가 곧 앱의 노출 기준(공시 전 분기는 시뮬에서 미래 정보)이므로 원본 공시가 정답.
SEC_UA = {"User-Agent": "charty data pipeline (sincci1994@gmail.com)"}
FUND_TICKERS = ["AAPL", "NVDA", "TSLA", "MSFT"]  # ETF(QQQ·SPY)는 companyfacts 없음
REV_TAGS = ["Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerExcludingAssessedTax"]  # 회계기준 변천(ASC 606 등)으로 태그가 갈림 — 병합


def edgar_quarters(cik, splits):
    """분기 재무 [[filedTs, endTs, rev, opInc, epsAdj], ...] endTs 오름차순.
    epsAdj는 분할 조정(기간 이후 분할비로 나눔) — 캔들이 yfinance 조정가라 기준을 맞춰야 PER이 성립.
    가정: '기간말~공시' 사이에 낀 분할(ASC 260 소급조정) 미처리 — 4종목 이력엔 없음, 종목 추가 시 재검토."""
    r = requests.get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json", headers=SEC_UA, timeout=60)
    r.raise_for_status()
    gaap = r.json()["facts"]["us-gaap"]

    def entries(tags, unit):
        pool = {}  # (start, end) -> (filed, val) — filed 최솟값(최초 공시)
        for tag in tags:
            for e in gaap.get(tag, {}).get("units", {}).get(unit, []):
                if e.get("start") and e.get("end") and e.get("val") is not None and e.get("filed"):
                    k = (e["start"], e["end"])
                    if k not in pool or e["filed"] < pool[k][0]:
                        pool[k] = (e["filed"], e["val"])
        # fp/form은 못 믿음(fp:"Q3"에 9개월 누적이 섞여 있음) — 기간 길이로 분기/연간 판별
        q, fy = {}, {}  # end -> (filed, val)
        for (start, end), fv in pool.items():
            days = (pd.Timestamp(end) - pd.Timestamp(start)).days
            if 70 <= days <= 100:
                q[end] = fv
            elif 340 <= days <= 380:
                fy[(start, end)] = fv
        # Q4 파생: 연간 − 회계연도 내 분기 3개 (EPS는 가중평균 주식수 차이로 근사치)
        for (start, end), (filed, val) in fy.items():
            if end in q:
                continue
            inside = [v for e2, (_, v) in q.items() if start <= e2 < end]
            if len(inside) == 3:
                q[end] = (filed, val - sum(inside))
        return q

    rev = entries(REV_TAGS, "USD")
    op = entries(["OperatingIncomeLoss"], "USD")
    eps = entries(["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"], "USD/shares")  # 적자기(TSLA 초기)는 Basic=Diluted 통합 태그로 공시
    rows = []
    for end in sorted(set(rev) | set(op) | set(eps)):
        filed = min(m[end][0] for m in (rev, op, eps) if end in m)
        factor = 1.0
        for d, ratio in splits.items():  # 기간 이후 분할만 누적
            if d.date() > pd.Timestamp(end).date():
                factor *= float(ratio)
        rows.append([
            int(pd.Timestamp(filed, tz="UTC").timestamp()), int(pd.Timestamp(end, tz="UTC").timestamp()),
            int(rev[end][1]) if end in rev else None,
            int(op[end][1]) if end in op else None,
            round(eps[end][1] / factor, 4) if end in eps else None,
        ])
    return rows


try:
    cikmap = {v["ticker"]: v["cik_str"] for v in requests.get(
        "https://www.sec.gov/files/company_tickers.json", headers=SEC_UA, timeout=60).json().values()}
    fund = {}
    for sym in FUND_TICKERS:
        rows = edgar_quarters(cikmap[sym], yf.Ticker(sym).splits)
        # 검산 — 실패 시 raise로 저장을 막음 (어제의 좋은 데이터 보존). XBRL은 ~2009년부터라 17년 × 4분기 기대
        assert len(rows) >= 45, f"{sym}: rows={len(rows)}"
        assert all(x[0] > x[1] for x in rows), f"{sym}: filed <= end"
        assert all(a[1] < b[1] for a, b in zip(rows, rows[1:])), f"{sym}: not sorted"
        for a, b in zip(rows, rows[1:]):  # 분기 연속성 — 태그 전환 경계에서 끊기면 여기 찍힘 (경고만)
            if b[1] - a[1] > 150 * 86400:
                print(f"  {sym} 분기 갭: {pd.Timestamp(a[1], unit='s').date()} → {pd.Timestamp(b[1], unit='s').date()}")
        fund[sym] = rows
        time.sleep(0.3)  # SEC fair access(10req/s)에 여유
    # 분할 조정 카나리아 — as-filed 희석EPS ÷ 누적 분할비 (AAPL 7:1 '14.06 + 4:1 '20.08)
    aapl = {x[1]: x[4] for x in fund["AAPL"]}
    for end, want in [("2015-06-27", 1.85 / 4), ("2012-12-29", 13.81 / 28)]:
        got = aapl.get(int(pd.Timestamp(end, tz="UTC").timestamp()))
        assert got is not None and abs(got - want) < 0.01, f"AAPL {end} epsAdj={got}, want≈{round(want, 4)}"
    save("fundamentals.json", json.dumps(fund, separators=(",", ":")))
    print("fundamentals.json:", {k: len(v) for k, v in fund.items()})
except Exception as e:  # EDGAR 장애·스키마 드리프트 — 재무만 건너뛰고 나머지 파이프라인 계속
    print("fundamentals 수집 실패 — 건너뜀:", repr(e))


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
    for i in range(6):  # 공유 러너 IP는 버스티하게 스로틀됨 — 백오프 60~960s로 버티면 살아나는 경우가 많음
        try:
            r = requests.get("https://api.gdeltproject.org/api/v2/doc/doc", params=p, timeout=30)
            if r.status_code == 429:  # 스로틀 — 지수 백오프 후 재시도 (마지막 시도면 잠만 자고 끝나니 바로 포기)
                if i == 5:
                    break
                time.sleep(60 * 2**i)
                continue
            arts = r.json().get("articles", [])
            out, seen = [], set()
            for a in arts:
                title = a.get("title", "").strip()
                dom = a.get("domain", "")
                sd = a.get("seendate")  # 없으면 skip — KeyError는 어느 except에도 안 잡혀 save 없이 즉사
                if not title or not sd or title in seen or dom not in SOURCES:
                    continue
                seen.add(title)
                out.append([int(pd.Timestamp(sd).timestamp()), title, SOURCES[dom]])
                if len(out) == 5:
                    break
            return out
        except (ValueError, requests.RequestException):
            time.sleep(10)  # 일시 오류 — 쉬고 재시도
    return None  # 6회 실패 — 차단 상태로 보고 중단 신호


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


def flush():  # NewsPanel이 오름차순을 가정하므로 저장 전 항상 sort
    archive.sort(key=lambda p: p[0])
    save("news-archive.json", json.dumps(archive, ensure_ascii=False, separators=(",", ":")))


last_save = time.monotonic()
while week + pd.Timedelta(days=7) <= now:
    got = gdelt_week(week)
    if got is None:  # 차단 지속 — 진행분 저장 후 중단, 다음 실행이 이 주부터 이어받음
        print("GDELT 429 지속 — 진행분 저장 후 중단:", week.date())
        break
    archive += got
    week += pd.Timedelta(days=7)
    if time.monotonic() - last_save > 600:  # 10분 체크포인트 — 타임아웃 킬·크래시에도 진행분 보존
        flush()
        last_save = time.monotonic()
    time.sleep(10)  # GDELT 제한(5초당 1요청)에 여유를 둠 — 최초 실행 ~1.5시간
flush()
print("news-archive.json:", len(archive), "headlines")
print("done ->", OUT)
