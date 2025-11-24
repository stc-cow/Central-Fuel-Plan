# Central Fuel Plan Dashboard

This repo fetches the Central Fuel Plan Google Sheet, generates fuel status reports, and renders a Leaflet-based dashboard. Only sites in the **Central** region (Column D) are included in the outputs.

## Setup
1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Generate reports and dashboard data:
   ```bash
   python main.py
   ```
   This produces `fuel_today.csv`, `fuel_pending.csv`, and `data.json`.

If the Google Sheet is blocked (e.g., 403 in this environment), the script will fall back to `sheet_cache.csv`.
To override the cache location, set `SHEET_LOCAL_PATH=/path/to/local.csv` before running.

## Dashboard
Open `index.html` in a browser to view KPIs and the interactive map. Marker colors show urgency:
- 🔴 overdue or due today
- 🟠 tomorrow
- 🟡 after tomorrow
- 🟢 dates beyond two days out
