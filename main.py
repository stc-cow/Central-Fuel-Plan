import json
import pandas as pd
from datetime import datetime

# Live Google Sheet CSV link
SHEET_URL = (
    "https://docs.google.com/spreadsheets/d/e/"
    "2PACX-1vS0GkXnQMdKYZITuuMsAzeWDtGUqEJ3lWwqNdA67NewOsDOgqsZHKHECEEkea4nrukx4-DqxKmf62nC"
    "/pub?gid=1149576218&single=true&output=csv"
)


# -------------------------------------------------------
# LOAD DATA (Google Sheet)
# -------------------------------------------------------
def load_data():
    print(f"Loading sheet: {SHEET_URL}")
    df = pd.read_csv(SHEET_URL)
    return df


# -------------------------------------------------------
# CLEAN + AUTO-DETECT COLUMNS
# -------------------------------------------------------
def clean_and_filter(df: pd.DataFrame) -> pd.DataFrame:
    """Auto-detect SiteName, CityName, NextFuelingPlan columns safely."""

    # Normalize column names
    df.columns = (
        df.columns.astype(str)
        .str.strip()
        .str.replace(" ", "", regex=False)
        .str.replace("_", "", regex=False)
        .str.replace("-", "", regex=False)
        .str.lower()
    )

    # Column detection priorities
    site_candidates = ["sitename", "site", "cowid", "siteno", "name"]
    city_candidates = ["cityname", "city", "location", "area", "region"]
    date_candidates = ["nextfuelingplan", "nextfueldate", "fueldate", "fuelplan"]

    def pick(candidates):
        return next((c for c in df.columns if c in candidates), None)

    site_col = pick(site_candidates)
    city_col = pick(city_candidates)
    date_col = pick(date_candidates)

    # Fallbacks for missing columns
    if site_col is None:
        df["sitename"] = "Unknown"
        site_col = "sitename"

    if city_col is None:
        df["cityname"] = "Unknown"
        city_col = "cityname"

    if date_col is None:
        df["nextfuelingplan"] = pd.NaT
        date_col = "nextfuelingplan"

    # Parse date column
    df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
    df = df.dropna(subset=[date_col])

    print(f"[INFO] Using columns: Site={site_col} | City={city_col} | Date={date_col}")

    return df[[site_col, city_col, date_col]]


# -------------------------------------------------------
# REPORT GENERATION
# -------------------------------------------------------
def generate_reports(df: pd.DataFrame) -> None:
    """Generate today's and pending fueling reports."""
    today = pd.to_datetime(datetime.today().date())

    site_col, city_col, date_col = df.columns.tolist()

    df_today = df[df[date_col] == today]
    df_pending = df[df[date_col] < today]

    df_today.to_csv("fuel_today.csv", index=False)
    df_pending.to_csv("fuel_pending.csv", index=False)

    print("[OK] fuel_today.csv generated.")
    print("[OK] fuel_pending.csv generated.")
    print(f"   -> Due today: {len(df_today)}")
    print(f"   -> Pending overdue: {len(df_pending)}")


# -------------------------------------------------------
# MAIN
# -------------------------------------------------------
def main():
    print("\nLoading Central Fuel Plan database...")
    df = load_data()

    print("Cleaning and extracting fuel plan data...")
    df = clean_and_filter(df)

    print("Generating reports...")
    generate_reports(df)

    print("\n[OK] Completed successfully.\n")


if __name__ == "__main__":
    main()
