# 1회 실행: yfinance에서 캔들 데이터를, FRED 공개 CSV에서 경제지표를 받아 public/data/*.json 생성
# 사용법: python scripts/fetch-data.py
import json
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

OHLCV = {"Open": "first", "High": "max", "Low": "min", "Close": "last", "Volume": "sum"}


def dump(df, symbol, tf):
    df = df.dropna()
    rows = [
        [int(ts.timestamp()), round(float(o), 4), round(float(h), 4),
         round(float(l), 4), round(float(c), 4), int(v)]
        for ts, o, h, l, c, v in zip(
            df.index, df["Open"], df["High"], df["Low"], df["Close"], df["Volume"])
    ]
    (OUT / f"{symbol}_{tf}.json").write_text(json.dumps(rows, separators=(",", ":")))
    print(f"{symbol}_{tf}: {len(rows)} candles")


for sym in TICKERS:
    t = yf.Ticker(sym)
    m5 = t.history(period="60d", interval="5m")
    dump(m5, sym, "5m")
    # ponytail: yfinance 15m/30m도 60일 제한이라 5m 리샘플과 커버리지 동일 — 그냥 리샘플
    dump(m5.resample("15min").agg(OHLCV).dropna(), sym, "15m")
    dump(m5.resample("30min").agg(OHLCV).dropna(), sym, "30m")
    h1 = t.history(period="730d", interval="1h")
    dump(h1, sym, "1h")
    # ponytail: yfinance에 4h가 없어 1h를 리샘플
    dump(h1.resample("4h").agg(OHLCV).dropna(), sym, "4h")
    dump(t.history(period="20y", interval="1d"), sym, "1d")
    dump(t.history(period="20y", interval="1wk"), sym, "1w")

(OUT / "tickers.json").write_text(json.dumps(TICKERS))


# ── 경제지표 (FRED fredgraph.csv — API 키 불필요) ──────────────────────────
# releaseTs는 실제 발표일이 아니라 근사치: 관측월 시작 + LAG_DAYS.
# ponytail: 정확한 발표 캘린더가 필요해지면 ALFRED vintage로 교체
FRED = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={}"
DAY = 86400


def fred(series):
    df = pd.read_csv(FRED.format(series), na_values=".")
    df.columns = ["date", "value"]
    df["date"] = pd.to_datetime(df["date"])
    return df.dropna()


def points(df, lag_days):
    return [[int(d.timestamp()) + lag_days * DAY, round(float(v), 2)]
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
fng_raw = requests.get("https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
                       headers=FNG_HDRS, timeout=30).json()["fear_and_greed_historical"]["data"]
fng = pd.Series({pd.to_datetime(int(p["x"]), unit="ms"): float(p["y"]) for p in fng_raw}).resample("W").last().dropna()
fng_pts = [[int(ts.timestamp()), round(float(v), 1)] for ts, v in fng.items()]

econ = [
    {"id": "FFR", "label": "기준금리(실효)", "unit": "%", "data": points(dff_m, 0)},
    {"id": "CPI", "label": "CPI 전년비", "unit": "%", "data": points(yoy("CPIAUCSL"), 45)},
    {"id": "PCE", "label": "PCE 물가 전년비", "unit": "%", "data": points(yoy("PCEPI"), 58)},
    {"id": "PPI", "label": "PPI 전년비", "unit": "%", "data": points(yoy("PPIACO"), 14)},
    {"id": "UNEMP", "label": "실업률", "unit": "%", "data": points(fred("UNRATE"), 37)},
    {"id": "NFP", "label": "비농업 고용 증감", "unit": "천 명", "data": points(payems, 37)},
    {"id": "M2", "label": "M2 증가율(전년비)", "unit": "%", "data": points(yoy("M2SL"), 28)},
    {"id": "VIX", "label": "VIX 변동성지수", "unit": "", "data": weekly("^VIX")},
    {"id": "NDX", "label": "나스닥 100", "unit": "", "data": weekly("^NDX")},
    {"id": "GOLD", "label": "금 선물 (온스)", "unit": "$", "data": weekly("GC=F")},
    {"id": "JPY", "label": "엔/달러", "unit": "¥", "data": weekly("JPY=X")},
    {"id": "WTI", "label": "WTI 유가", "unit": "$", "data": weekly("CL=F")},
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
print("done ->", OUT)
