import json
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import pandas as pd

# -------------------------------------------------------
# CONFIG
# -------------------------------------------------------
SHEET_URL = (
    "https://docs.google.com/spreadsheets/d/e/"
    "2PACX-1vS0GkXnQMdKYZITuuMsAzeWDtGUqEJ3lWwqNdA67NewOsDOgqsZHKHECEEkea4nrukx4-DqxKmf62nC"
    "/pub?gid=1149576218&single=true&output=csv"
)

CACHE_PATH = Path("sheet_cache.csv")
OUTPUT_JSON = Path("data.json")


# -------------------------------------------------------
# SAFE DATE PARSER – AJ (NextFuelingPlan)
# -------------------------------------------------------
def safe_parse_date(value: Any) -> Optional[datetime]:
    """Return a valid datetime or None if not a valid date."""
    if value is None:
        return None

    # Already datetime-like?
    if isinstance(value, (datetime, pd.Timestamp)):
        return pd.to_datetime(value).to_pydatetime()

    # Treat NaN / None / blanks
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass

    s = str(value).strip()
    if not s:
        return None

    # Explicitly skip error tokens from sheet
    if s in {"#N/A", "#DIV/0!", "#VALUE!", "N/A"}:
        return None

    # Try known formats (most important first)
    formats = [
        "%m-%d-%Y",  # e.g. 12-15-2025   (your current sheet)
        "%Y-%m-%d",  # e.g. 2025-12-15
        "%d-%m-%Y",  # 15-12-2025
        "%d/%m/%Y",  # 15/12/2025
        "%m/%d/%Y",  # 12/15/2025
        "%d-%b-%Y",  # 15-Dec-2025
        "%d %b %Y",  # 15 Dec 2025
    ]

    for fmt in formats:
        try:
            return datetime.strptime(s, fmt)
        except Exception:
            continue

    # Last resort: let pandas try
    try:
        dt = pd.to_datetime(s, errors="raise")
        return dt.to_pydatetime()
    except Exception:
        return None


# -------------------------------------------------------
# LOAD SHEET
# -------------------------------------------------------
def load_data() -> pd.DataFrame:
    """Load live Google Sheet, with optional local cache fallback."""
    print(f"[INFO] Loading sheet: {SHEET_URL}")
    try:
        df = pd.read_csv(SHEET_URL)
        print(f"[OK] Loaded live sheet: {len(df)} rows")
        # Optionally refresh cache
        try:
            df.to_csv(CACHE_PATH, index=False)
        except Exception:
            pass
        return df
    except Exception as exc:
        print(f"[WARN] Live sheet failed ({exc}), trying cache...")
        if not CACHE_PATH.exists():
            raise FileNotFoundError(
                f"No cache found at {CACHE_PATH}, and live sheet failed."
            )
        df = pd.read_csv(CACHE_PATH)
        print(f"[OK] Loaded cache: {len(df)} rows")
        return df


# -------------------------------------------------------
# CLEAN & FILTER PER PROJECT RULES
# -------------------------------------------------------
def clean_and_filter(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply Bannaga rules:

    1) Region (column D) = 'Central'
    2) COWStatus (column J) = ON-AIR or IN PROGRESS
    3) NextFuelingPlan (AJ) must be a valid date
    4) lat/lng must be valid numbers
    """

    # 1) Normalise columns
    print("[INFO] Normalising columns …")
    df = df.copy()
    df.columns = (
        pd.Index(df.columns)
        .astype(str)
        .str.strip()
        .str.lower()
        .str.replace(" ", "", regex=False)
    )

    print(f"[INFO] Normalised columns: {list(df.columns)}")

    # Expected canonical names from "Energy Dashboard" sheet
    site_col = "sitename"         # Column B
    region_col = "regionname"     # Column D
    status_col = "cowstatus"      # Column J
    date_col = "nextfuelingplan"  # Column AJ
    lat_col = "lat"               # Column L
    lng_col = "lng"               # Column M

    # Check required columns exist
    required = [site_col, region_col, status_col, date_col, lat_col, lng_col]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise KeyError(f"Missing expected columns in sheet: {missing}")

    # 2) Region filter → Central only
    df[region_col] = df[region_col].astype(str)
    df = df[df[region_col].str.strip().str.lower() == "central"].copy()
    print(f"[STEP] After region filter: {len(df)} rows")

    # 3) Status filter → ON-AIR or IN PROGRESS
    df[status_col] = df[status_col].astype(str).str.upper().str.strip()
    df = df[df[status_col].isin(["ON-AIR", "IN PROGRESS"])].copy()
    print(f"[STEP] After status filter: {len(df)} rows")

    # 4) Clean AJ (NextFuelingPlan) → only valid dates
    print("[INFO] Parsing NextFuelingPlan …")
    df["parsed_date"] = df[date_col].apply(safe_parse_date)
    before_dates = len(df)
    df = df.dropna(subset=["parsed_date"]).copy()
    after_dates = len(df)
    removed_dates = before_dates - after_dates
    print(
        f"[STEP] After removing invalid dates: {after_dates} "
        f"(removed {removed_dates})"
    )
    df["parsed_date"] = pd.to_datetime(df["parsed_date"])

    # 5) Coordinates filter → numeric & non-empty
    df["lat_num"] = pd.to_numeric(df[lat_col], errors="coerce")
    df["lng_num"] = pd.to_numeric(df[lng_col], errors="coerce")
    before_coords = len(df)
    df = df.dropna(subset=["lat_num", "lng_num"]).copy()
    after_coords = len(df)
    removed_coords = before_coords - after_coords
    print(
        f"[STEP] After removing missing coordinates: {after_coords} "
        f"(removed {removed_coords})"
    )

    # 6) Build cleaned dataframe for dashboard
    clean_df = pd.DataFrame(
        {
            "SiteName": df[site_col].astype(str).str.strip(),
            "Region": df[region_col].astype(str).str.strip(),
            "COWStatus": df[status_col].astype(str).str.strip(),
            "NextFuelingPlan": df["parsed_date"],
            "lat": df["lat_num"],
            "lng": df["lng_num"],
        }
    )

    print(f"[OK] Clean dataset ready: {len(clean_df)} rows")
    return clean_df


# -------------------------------------------------------
# EXPORT JSON FOR DASHBOARD
# -------------------------------------------------------
def generate_dashboard(df: pd.DataFrame) -> None:
    """
    Export cleaned dataset to data.json for the GitHub Pages dashboard.
    Structure:

    [
      {
        "SiteName": "...",
        "Region": "Central",
        "COWStatus": "ON-AIR",
        "NextFuelingPlan": "2025-12-01",
        "lat": 24.7136,
        "lng": 46.6753
      },
      ...
    ]
    """
    if df.empty:
        print("[WARN] Clean dataframe is empty. data.json will contain [].")

    df = df.copy()
    df["NextFuelingPlan"] = df["NextFuelingPlan"].dt.strftime("%Y-%m-%d")

    records = df.to_dict(orient="records")

    with OUTPUT_JSON.open("w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)

    print(f"[OK] {OUTPUT_JSON} exported → {len(records)} sites")


# -------------------------------------------------------
# MAIN
# -------------------------------------------------------
def main() -> None:
    df = load_data()
    clean_df = clean_and_filter(df)
    generate_dashboard(clean_df)
    print("[OK] Completed successfully.")


if __name__ == "__main__":
    main()
