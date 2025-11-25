# Central Fuel Plan Dashboard

This repo fetches the Central Fuel Plan Google Sheet, generates fuel status reports, and renders a Leaflet-based dashboard. Only sites in the **Central** region (Column D) are included in the outputs; when a region column is missing, the pipeline emits an empty dataset to avoid leaking non-Central rows.

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

   * Column detection favors the expected letters (B/F/AJ for site/city/date, D for region, L/M for lat/lng) and falls back to semantic names.
   * Dates are coerced to real timestamps, invalid rows are discarded, and only Central rows survive.
   * `data.json` is written only when latitude/longitude are present so the map markers remain accurate.

If the Google Sheet is blocked (e.g., 403 in this environment), the script will fall back to `sheet_cache.csv`.
To override the cache location, set `SHEET_LOCAL_PATH=/path/to/local.csv` before running.

## Dashboard
Open `index.html` in a browser to view KPIs and the interactive map. Marker colors show urgency:
- 🔴 overdue or due today
- 🟠 tomorrow
- 🟡 after tomorrow
- 🟢 dates beyond two days out
