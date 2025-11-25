import json
from datetime import datetime, timedelta
from pathlib import Path

from typing import Optional
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


# -------------------------------------------------------
# SAFE DATE PARSER
# -------------------------------------------------------
def safe_parse_date(value) -> Optional[datetime]:
    """
    Convert messy AJ values to datetime or return None.

    Handles:
      - text like 10-11-2025, 11-23-2025, 2025-11-24
      - 23-Nov-2025 / 23 Nov 2025
      - Excel / Google serial numbers (e.g. 45640)
      - ignores #N/A, #DIV/0!, empty, etc.
    """
    if value is None:
        return None

    # Google/Excel serial numbers
    if isinstance(value, (int, float)) and not pd.isna(value):
        # Excel epoch 1899-12-30
        try:
            base = datetime(1899, 12, 30)
            return base + timedelta(days=float(value))
        except Exception:
            return None

    if not isinstance(value, str):
        value = str(value)

    value = value.strip()
    if value == "" or value.upper() in {"#N/A", "#DIV/0!", "#VALUE!"}:
        return None

    # try a few common formats
    formats = [
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%m-%d-%Y",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%d-%b-%Y",
        "%d %b %Y",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(value, fmt)
        except Exception:
            continue

    # final attempt: let pandas try
    try:
        dt = pd.to_datetime(value, errors="raise")
        if isinstance(dt, pd.Timestamp):
            return dt.to_pydatetime()
    except Exception:
        pass

    return None


# -------------------------------------------------------
# LOAD SHEET
# -------------------------------------------------------
def load_data() -> pd.DataFrame:
    print(f"[INFO] Loading sheet from: {SHEET_URL}")
    try:
        df = pd.read_csv(SHEET_URL)
        df.to_csv(CACHE_PATH, index=False)  # refresh local cache
        print(f"[OK] Loaded live sheet: {len(df)} rows")
        return df
    except Exception as exc:
        print(f"[WARN] Live sheet failed ({exc}). Trying local cache: {CACHE_PATH}")
        if not CACHE_PATH.exists():
            raise FileNotFoundError(f"Cache not found at {CACHE_PATH}") from exc
        df = pd.read_csv(CACHE_PATH)
        print(f"[OK] Loaded cache: {len(df)} rows")
        return df


# -------------------------------------------------------
# CLEAN & FILTER
# -------------------------------------------------------
def clean_and_filter(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply project rules:

    - Region = Central only
    - COWStatus ∈ {ON-AIR, IN PROGRESS}
    - NextFuelingPlan must be a valid date
    - Keep lat/lng so we can show on the map
    """

    # Normalise column names (but we know the exact ones from your sheet)
    original_cols = df.columns.tolist()
    df.columns = (
        pd.Index(df.columns)
        .astype(str)
        .str.strip()
        .str.lower()
        .str.replace(" ", "", regex=False)
    )

    # Map to expected names
    site_col = "sitename"          # B
    region_col = "regionnam"       # D
    status_col = "cowstatus"       # J
    date_col = "nextfuelingplan"   # AJ
    lat_col = "lat"                # L
    lng_col = "lng"                # M

    print("[INFO] Original columns:", original_cols)
    print("[INFO] Normalised columns:", list(df.columns))

    total_rows = len(df)
    print(f"[STEP] Raw rows: {total_rows}")

    # Region = Central
    df[region_col] = df[region_col].astype(str)
    mask_region = df[region_col].str.strip().str.lower() == "central"
    df = df.loc[mask_region]
    print(f"[STEP] After region == Central: {len(df)} rows")

    # Status = ON-AIR or IN PROGRESS
    df[status_col] = df[status_col].astype(str).str.strip().str.upper()
    df = df[df[status_col].isin(["ON-AIR", "IN PROGRESS"])]
    print(f"[STEP] After status filter (ON-AIR / IN PROGRESS): {len(df)} rows")

    # Parse dates
    print("[INFO] Parsing NextFuelingPlan (AJ) ...")
    df["parsed_date"] = df[date_col].apply(safe_parse_date)
    before_dates = len(df)
    df = df.dropna(subset=["parsed_date"])
    print(f"[STEP] After dropping invalid dates: {len(df)} rows (removed {before_dates - len(df)})")

    # Ensure datetime64[ns] for JSON export / filtering later
    df["parsed_date"] = pd.to_datetime(df["parsed_date"])

    # Keep only rows with coordinates
    df["lat"] = pd.to_numeric(df[lat_col], errors="coerce")
    df["lng"] = pd.to_numeric(df[lng_col], errors="coerce")
    before_coords = len(df)
    df = df.dropna(subset=["lat", "lng"])
    print(f"[STEP] After dropping missing lat/lng: {len(df)} rows (removed {before_coords - len(df)})")

    # Build clean dataframe for dashboard
    clean = pd.DataFrame(
        {
            "SiteName": df[site_col].astype(str).str.strip(),
            "Region": df[region_col].astype(str).str.strip(),
            "COWStatus": df[status_col],
            "NextFuelingPlan": df["parsed_date"],
            "lat": df["lat"],
            "lng": df["lng"],
        }
    )

    print(f"[OK] Clean dataset size (Central + ON-AIR/IN PROGRESS + valid date + coords): {len(clean)}")
    return clean


# -------------------------------------------------------
# EXPORT JSON FOR DASHBOARD
# -------------------------------------------------------
def generate_dashboard(df: pd.DataFrame) -> None:
    """
    Export all eligible sites for the front-end dashboard.

    JS will:
      - count Total Sites = len(data.json)
      - split into Due/Today/Tomorrow/After Tomorrow
      - colour markers accordingly (red / yellow / orange / green)
    """
    df = df.copy()
    df["NextFuelingPlan"] = df["NextFuelingPlan"].dt.strftime("%Y-%m-%d")

    records = df.to_dict(orient="records")

    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    print(f"[OK] data.json exported with {len(records)} sites")


# -------------------------------------------------------
# MAIN
# -------------------------------------------------------
def main():
    df = load_data()
    clean_df = clean_and_filter(df)
    generate_dashboard(clean_df)
    print("[OK] Pipeline completed successfully.")


if __name__ == "__main__":
    main()
