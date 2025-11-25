import json
import os
from datetime import datetime
from typing import Optional, Sequence, Tuple

import pandas as pd
from pathlib import Path

# Live Google Sheet CSV link
SHEET_URL = (
    "https://docs.google.com/spreadsheets/d/e/"
    "2PACX-1vS0GkXnQMdKYZITuuMsAzeWDtGUqEJ3lWwqNdA67NewOsDOgqsZHKHECEEkea4nrukx4-DqxKmf62nC"
    "/pub?gid=1149576218&single=true&output=csv"
)


# -------------------------------------------------------
# DATE PARSER (New)
# -------------------------------------------------------
def safe_parse_date(value: str):
    """Return a valid date or None if not a valid date."""
    if not isinstance(value, str):
        return None

    value = value.strip()
    if not value:
        return None

    formats = [
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%m/%d/%Y",
        "%d/%m/%y",
        "%b %d %Y",
        "%d %b %Y",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(value, fmt)
        except Exception:
            continue

    return None


# -------------------------------------------------------
# LOAD DATA (Google Sheet)
# -------------------------------------------------------
def load_data() -> pd.DataFrame:
    """Load the live Google Sheet into a DataFrame."""

    print(f"Loading sheet: {SHEET_URL}")
    cache_path = Path(os.environ.get("SHEET_LOCAL_PATH", "sheet_cache.csv"))

    try:
        return pd.read_csv(SHEET_URL)
    except Exception as exc:  # pragma: no cover - network dependent
        print(f"[WARN] Failed to load live sheet ({exc}). Falling back to {cache_path}.")

    if not cache_path.exists():
        raise FileNotFoundError(
            f"Fallback cache not found at {cache_path}. Set SHEET_LOCAL_PATH to override."
        )

    return pd.read_csv(cache_path)


# -------------------------------------------------------
# COLUMN DETECTION HELPERS
# -------------------------------------------------------
def _normalize_columns(columns: Sequence[str]) -> pd.Index:
    return (
        pd.Index(columns)
        .astype(str)
        .str.strip()
        .str.replace(" ", "", regex=False)
        .str.replace("_", "", regex=False)
        .str.replace("-", "", regex=False)
        .str.lower()
    )


def _pick_column(df: pd.DataFrame, candidates: Sequence[str]) -> Optional[str]:
    return next((c for c in df.columns if c in candidates), None)


# -------------------------------------------------------
# CLEAN + FILTER
# -------------------------------------------------------
def clean_and_filter(df: pd.DataFrame) -> Tuple[pd.DataFrame, bool]:
    """Prepare the dataset and enforce Central-only rows."""

    df = df.copy()
    df.columns = _normalize_columns(df.columns)

    site_candidates = ["b", "sitename", "site", "cowid", "siteno", "name"]
    city_candidates = ["f", "cityname", "city", "location", "area"]
    date_candidates = ["aj", "nextfuelingplan", "nextfueldate", "fueldate", "fuelplan"]
    region_candidates = ["d", "region", "cluster", "area", "zone"]
    lat_candidates = ["l", "lat", "latitude"]
    lng_candidates = ["m", "lng", "lon", "long", "longitude"]

    site_col = _pick_column(df, site_candidates)
    city_col = _pick_column(df, city_candidates)
    date_col = _pick_column(df, date_candidates)
    region_col = _pick_column(df, region_candidates)
    lat_col = _pick_column(df, lat_candidates)
    lng_col = _pick_column(df, lng_candidates)

    if site_col is None:
        df["sitename"] = "Unknown"
        site_col = "sitename"

    if city_col is None:
        df["cityname"] = "Unknown"
        city_col = "cityname"

    if date_col is None:
        df["nextfuelingplan"] = pd.NaT
        date_col = "nextfuelingplan"

    # -----------------------------------------------------------
    # NEW: Exclude all non-date values from AJ column
    # -----------------------------------------------------------
    print("[INFO] Cleaning date column and removing non-date values...")
    df["__parsed_date"] = df[date_col].apply(safe_parse_date)
    df = df.dropna(subset=["__parsed_date"])
    df["NextFuelingParsed"] = pd.to_datetime(df["__parsed_date"]).dt.date
    df = df.drop(columns=["__parsed_date"])
    # Now the date column is guaranteed to contain only valid dates
    df[date_col] = pd.to_datetime(df["NextFuelingParsed"])
    df = df.drop(columns=["NextFuelingParsed"])

    # -----------------------------------------------------------

    # Filter by Region = Central
    if region_col:
        mask = df[region_col].astype(str).str.strip().str.lower() == "central"
        df = df.loc[mask]
        print(
            f"[INFO] Filtering Central region using column '{region_col}': kept {len(df)} rows"
        )
    else:
        print("[WARN] Region column not found; producing an empty dataset to avoid leaks.")
        df = df.iloc[0:0]

    df_clean = df[[site_col, city_col, date_col]].copy()
    df_clean = df_clean.rename(
        columns={
            site_col: "SiteName",
            city_col: "CityName",
            date_col: "NextFuelingPlan",
        }
    )

    has_coordinates = lat_col is not None and lng_col is not None
    if has_coordinates:
        df_clean["lat"] = df[lat_col]
        df_clean["lng"] = df[lng_col]
    else:
        print("[WARN] Latitude/longitude columns not found; map export will be skipped.")

    print(
        "[INFO] Using columns: Site=", site_col,
        "| City=", city_col,
        "| Date=", date_col,
        "| Region=", region_col,
        "| Lat=", lat_col,
        "| Lng=", lng_col,
    )

    return df_clean, has_coordinates


# -------------------------------------------------------
# REPORT GENERATION
# -------------------------------------------------------
def generate_reports(df: pd.DataFrame) -> None:
    """Generate today's and pending fueling reports."""

    today = pd.to_datetime(datetime.today().date())

    df_today = df[df["NextFuelingPlan"] == today]
    df_pending = df[df["NextFuelingPlan"] < today]

    df_today.to_csv("fuel_today.csv", index=False)
    df_pending.to_csv("fuel_pending.csv", index=False)

    print("[OK] fuel_today.csv generated.")
    print("[OK] fuel_pending.csv generated.")
    print(f"   -> Due today: {len(df_today)}")
    print(f"   -> Pending overdue: {len(df_pending)}")


# -------------------------------------------------------
# DASHBOARD EXPORT
# -------------------------------------------------------
def generate_dashboard_data(df: pd.DataFrame, include_map: bool) -> None:
    """Write dashboard-ready JSON with coordinates when available."""

    if not include_map:
        print("[WARN] Skipping data.json because coordinates are missing.")
        return

    geo_df = df.dropna(subset=["lat", "lng"])
    geo_df = geo_df.copy()
    geo_df["NextFuelingPlan"] = geo_df["NextFuelingPlan"].dt.strftime("%Y-%m-%d")

    records = geo_df[
        ["SiteName", "CityName", "NextFuelingPlan", "lat", "lng"]
    ].to_dict(orient="records")

    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    print(f"[OK] data.json generated with {len(records)} mapped sites.")


# -------------------------------------------------------
# MAIN
# -------------------------------------------------------
def main():
    print("\nLoading Central Fuel Plan database...")
    df = load_data()

    print("Cleaning, filtering Central region, and extracting fuel plan data...")
    df, has_coordinates = clean_and_filter(df)

    print("Generating reports...")
    generate_reports(df)

    print("Preparing dashboard export...")
    generate_dashboard_data(df, include_map=has_coordinates)

    print("\n[OK] Completed successfully.\n")


if __name__ == "__main__":
    main()

