import json
import os
from datetime import datetime
from pathlib import Path
from typing import Optional, Sequence, Tuple
import pandas as pd

SHEET_URL = (
    "https://docs.google.com/spreadsheets/d/e/"
    "2PACX-1vS0GkXnQMdKYZITuuMsAzeWDtGUqEJ3lWwqNdA67NewOsDOgqsZHKHECEEkea4nrukx4-DqxKmf62nC"
    "/pub?gid=1149576218&single=true&output=csv"
)

# -------------------------------------------------------
# SAFE DATE PARSER (fix errors in AJ)
# -------------------------------------------------------
def safe_parse_date(value):
    if not isinstance(value, str):
        return None
    value = value.strip()
    if value in ("", "#N/A", "#DIV/0!", "#VALUE!"):
        return None

    formats = [
        "%d-%m-%Y", "%m-%d-%Y", "%Y-%m-%d",
        "%d/%m/%Y", "%m/%d/%Y",
        "%d-%b-%Y", "%d %b %Y"
    ]

    for fmt in formats:
        try:
            return datetime.strptime(value, fmt)
        except:
            pass
    return None


# -------------------------------------------------------
# LOAD SHEET
# -------------------------------------------------------
def load_data() -> pd.DataFrame:
    print(f"[INFO] Loading sheet: {SHEET_URL}")
    cache = Path("sheet_cache.csv")

    try:
        return pd.read_csv(SHEET_URL)
    except Exception:
        print("[WARN] Live sheet failed, using cache")
        if not cache.exists():
            raise
        return pd.read_csv(cache)


# -------------------------------------------------------
# CLEAN & FILTER ACCORDING TO PROJECT RULES
# -------------------------------------------------------
def clean_and_filter(df: pd.DataFrame) -> Tuple[pd.DataFrame, bool]:
    df = df.copy()
    df.columns = _normalize_columns(df.columns)

    # Column detection
    site_col = _pick_column(df, ["b", "sitename", "site", "cowid"])
    region_col = _pick_column(df, ["d", "region", "regionname"])
    status_col = _pick_column(df, ["j", "cowstatus", "status"])
    date_col = _pick_column(df, ["aj", "nextfuelingplan", "nextfueldate"])
    lat_col = _pick_column(df, ["l", "lat", "latitude"])
    lng_col = _pick_column(df, ["m", "lng", "lon", "longitude"])

    # Basic cleanup
    df[site_col] = df[site_col].astype(str).str.strip()
    df[region_col] = df[region_col].astype(str).str.strip().str.lower()
    df[status_col] = df[status_col].astype(str).str.strip().str.upper()

    # FILTER 1 — Central region
    df = df[df[region_col] == "central"]

    # FILTER 2 — ON-AIR or IN PROGRESS
    df = df[df[status_col].isin(["ON-AIR", "IN PROGRESS"])]

    # FILTER 3 — Clean date column (AJ)
    df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
    df = df.dropna(subset=[date_col])              # keep only valid dates

    # FILTER 4 — require coordinates
    has_coordinates = lat_col is not None and lng_col is not None
    if has_coordinates:
        df = df.dropna(subset=[lat_col, lng_col])

    # FINAL CLEAN TABLE
    df_clean = df[[site_col, date_col, lat_col, lng_col]].copy()
    df_clean.rename(columns={
        site_col: "SiteName",
        date_col: "NextFuelingPlan",
        lat_col: "lat",
        lng_col: "lng"
    }, inplace=True)

    return df_clean, has_coordinates


# -------------------------------------------------------
# EXPORT JSON FOR DASHBOARD
# -------------------------------------------------------
def generate_dashboard(df):
    df = df.dropna(subset=["lat", "lng"])
    df = df.copy()
    df["NextFuelingPlan"] = df["NextFuelingPlan"].dt.strftime("%Y-%m-%d")

    records = df.to_dict(orient="records")

    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)

    print(f"[OK] data.json exported → {len(records)} sites")


# -------------------------------------------------------
# MAIN
# -------------------------------------------------------
def main():
    df = load_data()
    clean = clean_and_filter(df)
    generate_dashboard(clean)
    print("[OK] Completed successfully")


if __name__ == "__main__":
    main()
