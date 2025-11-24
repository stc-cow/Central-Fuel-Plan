import json
import os
from datetime import datetime
from typing import List

import pandas as pd

# Google Sheet CSV link
SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS0GkXnQMdKYZITuuMsAzeWDtGUqEJ3lWwqNdA67NewOsDOgqsZHKHECEEkea4nrukx4-DqxKmf62nC/pub?gid=1149576218&single=true&output=csv"
LOCAL_FALLBACK = os.getenv("SHEET_LOCAL_PATH", "sheet_cache.csv")


def load_data() -> pd.DataFrame:
    """
    Load the Google Sheet as a DataFrame.

    Falls back to a local CSV (sheet_cache.csv by default or SHEET_LOCAL_PATH env var)
    when remote access is blocked.
    """

    try:
        return pd.read_csv(SHEET_URL)
    except Exception as exc:
        if os.path.exists(LOCAL_FALLBACK):
            print(f"⚠️  Remote download failed ({exc}); using local cache: {LOCAL_FALLBACK}")
            return pd.read_csv(LOCAL_FALLBACK)

        raise RuntimeError(
            "Unable to download the Google Sheet and no local cache was found. "
            "Set SHEET_LOCAL_PATH to a reachable CSV or place a sheet_cache.csv file alongside main.py."
        ) from exc

def clean_and_filter(df: pd.DataFrame) -> pd.DataFrame:
    """
    Keep only the required columns, rows with valid dates, Central region only, and normalize
    coordinates.
    """
    df = df.rename(
        columns={
            'B': 'SiteName',
            'D': 'Region',
            'F': 'CityName',
            'L': 'lat',
            'M': 'lng',
            'AJ': 'NextFuelingPlan',
        }
    )

    df['NextFuelingPlan'] = pd.to_datetime(df['NextFuelingPlan'], errors='coerce')
    df = df.dropna(subset=['NextFuelingPlan'])

    df['Region'] = df['Region'].astype(str).str.strip().str.casefold()
    df = df[df['Region'] == 'central']

    df['lat'] = pd.to_numeric(df.get('lat'), errors='coerce')
    df['lng'] = pd.to_numeric(df.get('lng'), errors='coerce')

    return df[['SiteName', 'CityName', 'NextFuelingPlan', 'lat', 'lng']]

def generate_reports(df: pd.DataFrame) -> None:
    """Generate CSVs for today's and pending fueling plans."""
    today = pd.to_datetime(datetime.today().date())

    df_today = df[df['NextFuelingPlan'] == today]
    df_pending = df[df['NextFuelingPlan'] < today]

    df_today[['SiteName', 'CityName', 'NextFuelingPlan']].to_csv('fuel_today.csv', index=False)
    df_pending[['SiteName', 'CityName', 'NextFuelingPlan']].to_csv('fuel_pending.csv', index=False)

    print("\n✔ fuel_today.csv generated.")
    print("✔ fuel_pending.csv generated.")
    print(f"   → Due today: {len(df_today)}")
    print(f"   → Pending/overdue: {len(df_pending)}\n")


def generate_dashboard_data(df: pd.DataFrame, output_path: str = 'data.json') -> None:
    """Create a JSON export for the dashboard, preserving location data when present."""

    def _sanitize_coordinate(value) -> float | None:
        if pd.isna(value):
            return None
        return float(value)

    records: List[dict] = []

    for record in df.to_dict(orient='records'):
        next_plan = record['NextFuelingPlan']
        next_plan_date = next_plan.date()

        records.append(
            {
                'SiteName': record['SiteName'],
                'CityName': record['CityName'],
                'NextFuelingPlan': next_plan_date.isoformat(),
                'lat': _sanitize_coordinate(record.get('lat')),
                'lng': _sanitize_coordinate(record.get('lng')),
            }
        )

    with open(output_path, 'w', encoding='utf-8') as fp:
        json.dump(records, fp, ensure_ascii=False, indent=2)

    print(f"✔ {output_path} generated for the dashboard.")

def main() -> None:
    print("\nLoading Central Fuel Plan database...")
    df = load_data()

    print("Filtering valid date entries (Column AJ) and extracting required fields...")
    df = clean_and_filter(df)

    print("Generating fuel plan reports...")
    generate_reports(df)

    print("Preparing data.json for the dashboard...")
    generate_dashboard_data(df)

if __name__ == "__main__":
    main()
