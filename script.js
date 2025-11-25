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

const COLOR_GREEN = "#3ad17c";
const COLOR_YELLOW = "#ffc857";
const COLOR_RED = "#fb6d5d";

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

function formatDate(date) {
  if (!date) return "-";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// DOM references
const metricDue = document.getElementById("metric-due");
const metricTomorrow = document.getElementById("metric-tomorrow");
const metricAfter = document.getElementById("metric-after");
const dueList = document.getElementById("due-list");

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

  let countDue = 0;
  let countTomorrow = 0;
  let countAfter = 0;

    const dateEl = document.createElement("div");
    dateEl.className = "site-date";
    dateEl.textContent = formatDate(site.nextFuelDate);

    li.appendChild(nameEl);
    li.appendChild(dateEl);

    dueList.appendChild(li);
  });
}

    if (days !== null) {
      if (days <= 0) countDue += 1;
      else if (days === 1) countTomorrow += 1;
      else if (days >= 2) countAfter += 1;
    }

    const marker = L.circleMarker([site.lat, site.lng], {
      radius: 8,
      color,
      weight: 2,
      fillColor: color,
      fillOpacity: 0.85,
    }).addTo(markerLayer);

  // Update metrics
  metricDue.textContent = countDue;
  metricTomorrow.textContent = countTomorrow;
  metricAfter.textContent = countAfter;

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

    const nameEl = document.createElement("div");
    nameEl.className = "site-name";
    nameEl.textContent = site.SiteName || "-";

    const dateEl = document.createElement("div");
    dateEl.className = "site-date";
    dateEl.textContent = formatDate(site.date);

    if (site.days <= 0) {
      li.classList.add("site-due");
    }

    li.appendChild(nameEl);
    li.appendChild(dateEl);

fetchAndRender();
startAutoRefresh();
