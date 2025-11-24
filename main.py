import pandas as pd
from datetime import datetime

# Google Sheet CSV link
SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS0GkXnQMdKYZITuuMsAzeWDtGUqEJ3lWwqNdA67NewOsDOgqsZHKHECEEkea4nrukx4-DqxKmf62nC/pub?gid=1149576218&single=true&output=csv"

def load_data():
    """Load the Google Sheet as a DataFrame."""
    return pd.read_csv(SHEET_URL)

def clean_and_filter(df: pd.DataFrame) -> pd.DataFrame:
    """Keep only the required columns and rows with valid dates."""
    df = df.rename(columns={
        'B': 'SiteName',
        'F': 'CityName',
        'AJ': 'NextFuelingPlan',
    })

    df['NextFuelingPlan'] = pd.to_datetime(df['NextFuelingPlan'], errors='coerce')
    df = df.dropna(subset=['NextFuelingPlan'])

    return df[['SiteName', 'CityName', 'NextFuelingPlan']]

def generate_reports(df: pd.DataFrame) -> None:
    """Generate CSVs for today's and pending fueling plans."""
    today = pd.to_datetime(datetime.today().date())

    df_today = df[df['NextFuelingPlan'] == today]
    df_pending = df[df['NextFuelingPlan'] < today]

    df_today.to_csv('fuel_today.csv', index=False)
    df_pending.to_csv('fuel_pending.csv', index=False)

    print("\n✔ fuel_today.csv generated.")
    print("✔ fuel_pending.csv generated.")
    print(f"   → Due today: {len(df_today)}")
    print(f"   → Pending/overdue: {len(df_pending)}\n")

def main() -> None:
    print("\nLoading Central Fuel Plan database...")
    df = load_data()

    print("Filtering valid date entries (Column AJ) and extracting required fields...")
    df = clean_and_filter(df)

    print("Generating fuel plan reports...")
    generate_reports(df)

if __name__ == "__main__":
    main()
