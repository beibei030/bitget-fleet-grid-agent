"""Bitget 公共行情 — 与 Agent Hub MCP 同源 API。"""

from __future__ import annotations

import time
from dataclasses import dataclass

import pandas as pd
import requests

BASE = "https://api.bitget.com/api/v2/mix/market"
PRODUCT = "USDT-FUTURES"

_GRAN_MAP = {"1h": "1H", "4h": "4H", "6h": "6H", "12h": "12H", "1d": "1D", "3d": "3D", "1w": "1W", "5m": "5m"}


@dataclass
class FundingPoint:
    ts: int
    rate: float


def _get(path: str, params: dict, retries: int = 3) -> dict | list:
    last = None
    for attempt in range(retries):
        try:
            r = requests.get(f"{BASE}/{path}", params=params, timeout=25)
            r.raise_for_status()
            body = r.json()
            if body.get("code") not in ("00000", "0", 0):
                raise RuntimeError(f"Bitget error: {body.get('code')} {body.get('msg')}")
            return body.get("data", {})
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(1.0 * (attempt + 1))
    raise RuntimeError(f"Bitget {path} failed: {last}")


def get_ticker(symbol: str = "SOLUSDT") -> dict:
    data = _get("ticker", {"symbol": symbol, "productType": PRODUCT})
    rows = data if isinstance(data, list) else [data]
    return rows[0]


def get_current_funding(symbol: str = "SOLUSDT") -> float:
    data = _get("current-fund-rate", {"symbol": symbol, "productType": PRODUCT})
    rows = data if isinstance(data, list) else data.get("currentFundRate", data)
    if isinstance(rows, list) and rows:
        return float(rows[0]["fundingRate"])
    if isinstance(data, dict) and "fundingRate" in data:
        return float(data["fundingRate"])
    raise RuntimeError(f"Unexpected funding payload: {data}")


def get_candles_many(symbol: str = "SOLUSDT", granularity: str = "1H", bars: int = 720) -> pd.DataFrame:
    """分页拉取 K 线，升序返回。"""
    gran = _GRAN_MAP.get(granularity.lower(), granularity)
    end_ms: int | None = None
    chunks: list[pd.DataFrame] = []

    while sum(len(c) for c in chunks) < bars:
        params: dict = {
            "symbol": symbol,
            "productType": PRODUCT,
            "granularity": gran,
            "limit": min(1000, bars - sum(len(c) for c in chunks)),
        }
        if end_ms is not None:
            params["endTime"] = str(end_ms)
        data = _get("candles", params)
        rows = data if isinstance(data, list) else []
        if not rows:
            break
        recs = [
            {
                "ts": int(x[0]),
                "open": float(x[1]),
                "high": float(x[2]),
                "low": float(x[3]),
                "close": float(x[4]),
                "volume": float(x[5]),
            }
            for x in rows
        ]
        chunks.append(pd.DataFrame(recs))
        end_ms = int(recs[-1]["ts"]) - 1 if recs else None
        if len(rows) < params["limit"]:
            break
        time.sleep(0.2)

    if not chunks:
        return pd.DataFrame(columns=["ts", "open", "high", "low", "close", "volume"])
    out = pd.concat(chunks, ignore_index=True).drop_duplicates(subset=["ts"]).sort_values("ts")
    return out.reset_index(drop=True).tail(bars)
