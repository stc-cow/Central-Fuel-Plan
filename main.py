import json
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

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
    """Convert messy Google-Sheet values to datetime or None."""

    if value is None:
        return None

    # Excel/Google numeric serial dates
    if isinstance(value, (int, float)) and not pd.isna(value):
        try:
            base = datetime(1899, 12, 30)
            return base + timedelta(days=float(value))
        except:
            return None

    # Convert to string
    if not isinstance(value, str):
        value = str(value)

    value = value.strip()
    if value == "" or value.upper() in {"#N/A", "#DIV/0!", "#VALUE!"}:
        return None

    # Formats to test
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
        except:
            pass

    # Final fallback
    try:
        dt = pd.to_datetime(value, errors="raise")
        if isinstance(dt, pd.Timestamp):
            return dt.to_pydatetime()
    except:
        return None

    return None


# -------------------------------------------------------
# LOAD SHEET
# -------------------------------------------------------
def load_data() -> pd.DataFrame:
    print(f"[INFO] Loading sheet: {SHEET_URL}")
    try:
        df = pd.read_csv(SHEET_URL)
        df.to_csv(CACHE_PATH, index=False)
        print(f"[OK] Loaded live sheet: {len(df)} rows")
        return df
    except Exception as exc:
        print(f"[WARN] Live sheet failed ({exc}), loading cache")
        if not CACHE_PATH.exists():
            raise
        df = pd.read_csv(CACHE_PATH)
        print(f"[OK] Loaded cache: {len(df)} rows")
        return df


# -------------------------------------------------------
# CLEAN & FILTER
# -------------------------------------------------------
def clean_and_filter(df: pd.DataFrame) -> pd.DataFrame:
    """Apply all project rules."""
    print("[INFO] Normalising columns…")

    original_cols = df.columns.tolist()
    df.columns = (
        pd.Index(df.columns)
        .astype(str)
        .str.strip()
        .str.lower()
        .str.replace(" ", "")
    )

    print("[INFO] Normalised columns:", list(df.columns))

    site_col = "sitename"         # Column B
    region_col = "regionnam"      # Column D
    status_col = "cowstatus"      # Column J
    date_col = "nextfuelingplan"  # Column AJ
    lat_col = "lat"               # Column L
    lng_col = "lng"               # Column M

    # 1️⃣ Region = Central
    df[region_col] = df[region_col].astype(str)
    df = df[df[region_col].str.strip().str.lower() == "central"]
    print(f"[STEP] After region filter: {len(df)}")

    # 2️⃣ Status = ON-AIR or IN PROGRESS
    df[status_col] = df[status_col].astype(str).str.upper().str.strip()
    df = df[df[status_col].isin(["ON-AIR", "IN PROGRESS"])]
    print(f"[STEP] After status filter: {len(df)}")

    # 3️⃣ Clean AJ date column
    print("[INFO] Parsing NextFuelingPlan…")
    df["parsed_date"] = df[date_col].apply(safe_parse_date)
    before = len(df)
    df = df.dropna(subset=["parsed_date"])
    print(f"[STEP] After removing invalid dates: {len(df)} (removed {before-len(df)})")

    df["parsed_date"] = pd.to_datetime(df["parsed_date"])

    # 4️⃣ Coordinates
    df["lat"] = pd.to_numeric(df[lat_col], errors="coerce")
    df["lng"] = pd.to_numeric(df[lng_col], errors="coerce")
    before = len(df)
    df = df.dropna(subset=["lat", "lng"])
    print(f"[STEP] After removing missing coordinates: {len(df)} (removed {before-len(df)})")

    # Build final table
    clean = pd.DataFrame({
        "SiteName": df[site_col].astype(str).strip(),
        "Region": df[region_col],
        "COWStatus": df[status_col],
        "NextFuelingPlan": df["parsed_date"],
        "lat": df["lat"],
        "lng": df["lng"]
    })

    print(f"[OK] Clean dataset ready: {len(clean)} rows")
    return clean


# -------------------------------------------------------
# EXPORT JSON FOR DASHBOARD
# -------------------------------------------------------
def generate_dashboard(df: pd.DataFrame):
    df = df.copy()
    df["NextFuelingPlan"] = df["NextFuelingPlan"].dt.strftime("%Y-%m-%d")

    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(df.to_dict(orient="records"), f, indent=2)

    print(f"[OK] data.json exported ({len(df)} sites)")


# -------------------------------------------------------
# MAIN
# -------------------------------------------------------
def main():
    df = load_data()
    clean_df = clean_and_filter(df)
    generate_dashboard(clean_df)
    print("[OK] Completed successfully")


if __name__ == "__main__":
    main()
