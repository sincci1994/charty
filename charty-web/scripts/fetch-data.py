# 1회 실행: yfinance에서 캔들 데이터를 받아 public/data/*.json 생성
# 사용법: python scripts/fetch-data.py
import json
from pathlib import Path

import yfinance as yf

TICKERS = ["QQQ", "SPY", "AAPL", "NVDA", "TSLA", "MSFT"]
OUT = Path(__file__).resolve().parent.parent / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)


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
    dump(t.history(period="60d", interval="5m"), sym, "5m")
    h1 = t.history(period="730d", interval="1h")
    dump(h1, sym, "1h")
    # ponytail: yfinance에 4h가 없어 1h를 리샘플
    h4 = h1.resample("4h").agg(
        {"Open": "first", "High": "max", "Low": "min", "Close": "last", "Volume": "sum"}
    ).dropna()
    dump(h4, sym, "4h")

(OUT / "tickers.json").write_text(json.dumps(TICKERS))
print("done ->", OUT)
