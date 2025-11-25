const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS0GkXnQMdKYZITuuMsAzeWDtGUqEJ3lWwqNdA67NewOsDOgqsZHKHECEEkea4nrukx4-DqxKmf62nC/pub?gid=1149576218&single=true&output=csv";

const COLUMN_INDEX = {
  siteName: 1, // Column B
  regionName: 3, // Column D
  latitude: 11, // Column L
  longitude: 12, // Column M
  nextFuelDate: 35, // Column AJ
};

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

// Approximate bounds for Saudi Arabia: [southWest, northEast]
const SAUDI_BOUNDS = [
  [16.0, 34.0],
  [33.5, 56.0],
];

const map = L.map("map", {
  maxBounds: SAUDI_BOUNDS,
  maxBoundsViscosity: 0.7,
  minZoom: 4,
  maxZoom: 12,
}).setView([23.8859, 45.0792], 5.3);

L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
  }
).addTo(map);

const markerLayer = L.layerGroup().addTo(map);

const COLOR_GREEN = "#2fd470";
const COLOR_YELLOW = "#ffd447";
const COLOR_ORANGE = "#ffa047";
const COLOR_RED = "#ff5f56";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const metricTotal = document.getElementById("metric-total");
const metricDue = document.getElementById("metric-due");
const metricTomorrow = document.getElementById("metric-tomorrow");
const metricAfter = document.getElementById("metric-after");
const dueList = document.getElementById("due-list");
const refreshBtn = document.getElementById("refresh-btn");
const loader = document.getElementById("loader");
const errorBanner = document.getElementById("error");
const lastUpdated = document.getElementById("last-updated");

let refreshTimer;

function toggleLoading(isLoading) {
  loader.classList.toggle("hidden", !isLoading);
  refreshBtn.disabled = isLoading;
}

function formatDate(date) {
  if (!date) return "-";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === "\"") {
      const next = line[i + 1];
      if (inQuotes && next === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}

function parseCsv(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map(splitCsvLine);
}

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }
  return null;
}

function daysDiffFromToday(date) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date - today) / ONE_DAY_MS);
}

function getStatus(days) {
  if (days === null) return { status: "unknown", color: COLOR_GREEN };
  if (days <= 0) return { status: "due", color: COLOR_RED };
  if (days === 1) return { status: "tomorrow", color: COLOR_YELLOW };
  if (days === 2) return { status: "after", color: COLOR_ORANGE };
  return { status: "healthy", color: COLOR_GREEN };
}

function buildSites(rows) {
  if (rows.length === 0) return [];
  const hasHeader = rows[0]?.[COLUMN_INDEX.siteName]
    ?.toLowerCase?.()
    ?.includes("site");
  const dataRows = hasHeader ? rows.slice(1) : rows;

  return dataRows
    .map((row) => {
      const siteName = row[COLUMN_INDEX.siteName]?.trim();
      const regionName = row[COLUMN_INDEX.regionName]?.trim();
      const lat = parseFloat(row[COLUMN_INDEX.latitude]);
      const lng = parseFloat(row[COLUMN_INDEX.longitude]);
      const nextFuelRaw = row[COLUMN_INDEX.nextFuelDate]?.trim();
      return {
        siteName,
        regionName,
        lat,
        lng,
        nextFuelDate: parseDate(nextFuelRaw),
        nextFuelRaw,
      };
    })
    .filter((row) => row.regionName === "Central" && !Number.isNaN(row.lat) && !Number.isNaN(row.lng));
}

function updateCounters(summary) {
  metricTotal.textContent = summary.total;
  metricDue.textContent = summary.due;
  metricTomorrow.textContent = summary.tomorrow;
  metricAfter.textContent = summary.after;
}

function populateDueTable(dueSites) {
  dueList.innerHTML = "";

  if (dueSites.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-row";
    li.textContent = "No sites due today or overdue.";
    dueList.appendChild(li);
    return;
  }

  dueSites.forEach((site) => {
    const li = document.createElement("li");
    li.className = "site-item";

    const nameEl = document.createElement("div");
    nameEl.className = "site-name";
    nameEl.textContent = site.siteName || "-";

    const dateEl = document.createElement("div");
    dateEl.className = "site-date";
    dateEl.textContent = formatDate(site.nextFuelDate);

    li.appendChild(nameEl);
    li.appendChild(dateEl);

    dueList.appendChild(li);
  });
}

function renderMapMarkers(sites) {
  markerLayer.clearLayers();
  const allMarkers = [];
  const priorityMarkers = [];

  sites.forEach((site) => {
    const days = daysDiffFromToday(site.nextFuelDate);
    const { status, color } = getStatus(days);

    const marker = L.circleMarker([site.lat, site.lng], {
      radius: 8,
      color,
      weight: 2,
      fillColor: color,
      fillOpacity: 0.85,
    }).addTo(markerLayer);

    marker.bindPopup(
      `<div class="popup"><strong>${site.siteName || "-"}</strong><br/>Fuel date: ${formatDate(
        site.nextFuelDate
      )}<br/>Status: ${status}</div>`
    );

    allMarkers.push(marker);
    if (status === "due") priorityMarkers.push(marker);
  });

  if (priorityMarkers.length > 0) {
    const group = L.featureGroup(priorityMarkers);
    map.fitBounds(group.getBounds().pad(0.35));
    return;
  }

  if (allMarkers.length > 0) {
    const group = L.featureGroup(allMarkers);
    map.fitBounds(group.getBounds().pad(0.3));
  }
}

function summarizeSites(sites) {
  const summary = {
    total: sites.length,
    due: 0,
    tomorrow: 0,
    after: 0,
  };

  const dueSites = [];

  sites.forEach((site) => {
    const days = daysDiffFromToday(site.nextFuelDate);
    if (days === null) return;

    if (days <= 0) {
      summary.due += 1;
      dueSites.push(site);
    } else if (days === 1) {
      summary.tomorrow += 1;
    } else if (days === 2) {
      summary.after += 1;
    }
  });

  dueSites.sort((a, b) => (a.nextFuelDate || 0) - (b.nextFuelDate || 0));
  return { summary, dueSites };
}

function setUpdatedTimestamp() {
  const now = new Date();
  lastUpdated.textContent = `Updated ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

async function fetchAndRender() {
  toggleLoading(true);
  errorBanner.classList.add("hidden");

  try {
    const response = await fetch(SHEET_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error("Network response was not ok");
    const csvText = await response.text();
    const rows = parseCsv(csvText);
    const sites = buildSites(rows);

    const { summary, dueSites } = summarizeSites(sites);
    updateCounters(summary);
    populateDueTable(dueSites);
    renderMapMarkers(sites);
    setUpdatedTimestamp();
  } catch (err) {
    console.error("Failed to load sheet", err);
    errorBanner.classList.remove("hidden");
    updateCounters({ total: 0, due: 0, tomorrow: 0, after: 0 });
    populateDueTable([]);
  } finally {
    toggleLoading(false);
  }
}

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(fetchAndRender, REFRESH_INTERVAL_MS);
}

refreshBtn.addEventListener("click", fetchAndRender);

fetchAndRender();
startAutoRefresh();
