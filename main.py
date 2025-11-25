import json
import os
from datetime import datetime
from pathlib import Path
import pandas as pd

# -------------------------------------------------------
# LIVE GOOGLE SHEET URL
# -------------------------------------------------------
SHEET_URL = (
    "https://docs.google.com/spreadsheets/d/e/"
    "2PACX-1vS0GkXnQMdKYZITuuMsAzeWDtGUqEJ3lWwqNdA67NewOsDOgqsZHKHECEEkea4nrukx4-DqxKmf62nC"
    "/pub?gid=1149576218&single=true&output=csv"
)

# -------------------------------------------------------
# SAFE DATE PARSER
# -------------------------------------------------------
def safe_parse_date(value):
    if not isinstance(value, str):
        return None

    value = value.strip()
    if value in ("", "#N/A", "#DIV/0!", "#VALUE!"):
        return None

    formats = [
        "%Y-%m-%d",
        "%d-%m-%Y", "%m-%d-%Y",
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
def load_data():
    print(f"[INFO] Loading live sheet: {SHEET_URL}")

    try:
        df = pd.read_csv(SHEET_URL)
        print(f"[INFO] Loaded {len(df)} rows from live sheet.")
        return df

    except Exception as e:
        print(f"[ERROR] Failed to load live sheet → {e}")
        raise


# -------------------------------------------------------
# CLEANING AND FILTERING
# -------------------------------------------------------
def clean_and_filter(df):

    print("[INFO] Normalizing columns…")

    # Normalize column names
    df.columns = (
        pd.Index(df.columns)
        .astype(str)
        .str.strip()
        .str.lower()
        .str.replace(" ", "")
        .str.replace("_", "")
    )

    # Expected columns after normalization
    site_col   = "sitename"
    region_col = "regionname"
    status_col = "cowstatus"
    date_col   = "nextfuelingplan"
    lat_col    = "lat"
    lng_col    = "lng"

    # Debug print column list
    print("[DEBUG] Columns detected:", list(df.columns))

    # 1️⃣ REGION = CENTRAL
    df = df[df[region_col].astype(str).str.lower() == "central"]
    print(f"[INFO] Central region rows: {len(df)}")

    # 2️⃣ STATUS FILTER
    df[status_col] = df[status_col].astype(str).str.upper().str.strip()
    df = df[df[status_col].isin(["ON-AIR", "IN PROGRESS"])]
    print(f"[INFO] ON-AIR + IN PROGRESS rows: {len(df)}")

    # 3️⃣ DATE CLEANING
    print("[INFO] Parsing date column…")
    df["parsed_date"] = df[date_col].apply(safe_parse_date)
    before = len(df)
    df = df.dropna(subset=["parsed_date"])
    after = len(df)
    print(f"[INFO] Removed invalid dates: {before - after}")

    df["parsed_date"] = pd.to_datetime(df["parsed_date"])

    # 4️⃣ CREATE CLEAN DF
    clean = pd.DataFrame({
        "SiteName": df[site_col].astype(str).str.strip(),
        "Region": df[region_col],
        "COWStatus": df[status_col],
        "NextFuelingPlan": df["parsed_date"],
        "lat": pd.to_numeric(df[lat_col], errors="coerce"),
        "lng": pd.to_numeric(df[lng_col], errors="coerce")
    })

    # Drop missing coordinates
    clean = clean.dropna(subset=["lat", "lng"])
    print(f"[INFO] Rows with valid coordinates: {len(clean)}")

    return clean


# -------------------------------------------------------
# EXPORT JSON
# -------------------------------------------------------
def generate_dashboard(df):

    df = df.copy()
    df["NextFuelingPlan"] = df["NextFuelingPlan"].dt.strftime("%Y-%m-%d")

    records = df.to_dict(orient="records")

    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)

    print(f"[OK] data.json generated → {len(records)} sites")


# -------------------------------------------------------
# MAIN
# -------------------------------------------------------
def main():
    df = load_data()
    clean = clean_and_filter(df)
    generate_dashboard(clean)
    print("\n[OK] Completed successfully.\n")


if __name__ == "__main__":
    main()
