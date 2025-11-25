//-------------------------------------------------------------
// CONFIG
//-------------------------------------------------------------
const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS0GkXnQMdKYZITuuMsAzeWDtGUqEJ3lWwqNdA67NewOsDOgqsZHKHECEEkea4nrukx4-DqxKmf62nC/pub?gid=1149576218&single=true&output=csv";

const COL = {
  siteName: 1,     // Column B
  region: 3,       // Column D
  lat: 11,         // Column L
  lng: 12,         // Column M
  fuelDate: 35,    // Column AJ
};

const ONE_DAY = 24 * 60 * 60 * 1000;

const COLOR = {
  DUE: "#fb6d5d",
  TOMORROW: "#ffc857",
  AFTER: "#ff9f1c",
  HEALTHY: "#3ad17c",
};

const map = L.map("map", {
  maxBounds: [
    [16.0, 34.0],
    [33.5, 56.0],
  ],
  maxBoundsViscosity: 0.8,
  minZoom: 4,
}).setView([23.8859, 45.0792], 6);

// Satellite tiles
L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    attribution: "Tiles © Esri | Maxar",
  }
).addTo(map);

const markerLayer = L.layerGroup().addTo(map);

// Metrics
const metricTotal = document.getElementById("metric-total");
const metricDue = document.getElementById("metric-due");
const metricTomorrow = document.getElementById("metric-tomorrow");
const metricAfter = document.getElementById("metric-after");

const dueList = document.getElementById("due-list");
const loader = document.getElementById("loader");
const errorBanner = document.getElementById("error");

function toggleLoading(flag) {
  loader.classList.toggle("hidden", !flag);
}

//-------------------------------------------------------------
// HELPERS
//-------------------------------------------------------------
function parseCsv(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => splitCsvLine(line));
}

function splitCsvLine(line) {
  let cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    let char = line[i];

    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i++;
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

function parseDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt)) return null;
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function formatDate(dt) {
  if (!dt) return "-";
  return dt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function dateDiffFromToday(dt) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (!dt) return null;
  return Math.round((dt - today) / ONE_DAY);
}

//-------------------------------------------------------------
// STATUS LOGIC
//-------------------------------------------------------------
function getStatus(days) {
  if (days === null) return { label: "unknown", color: COLOR.HEALTHY };
  if (days <= 0) return { label: "due", color: COLOR.DUE };
  if (days === 1) return { label: "tomorrow", color: COLOR.TOMORROW };
  if (days === 2) return { label: "after", color: COLOR.AFTER };
  return { label: "healthy", color: COLOR.HEALTHY };
}

//-------------------------------------------------------------
// RENDER MAP + METRICS
//-------------------------------------------------------------
function renderSites(sites) {
  markerLayer.clearLayers();

  let countDue = 0;
  let countTomorrow = 0;
  let countAfter = 0;

  let dueSites = [];
  let markers = [];
  let priorityMarkers = [];

  sites.forEach((s) => {
    const days = dateDiffFromToday(s.fuelDate);
    const { label, color } = getStatus(days);

    if (days !== null) {
      if (days <= 0) countDue++;
      else if (days === 1) countTomorrow++;
      else if (days === 2) countAfter++;
    }

    if (label === "due") dueSites.push(s);

    const marker = L.circleMarker([s.lat, s.lng], {
      radius: 9,
      color,
      fillColor: color,
      fillOpacity: 0.85,
      weight: 2,
    }).addTo(markerLayer);

    marker.bindPopup(
      `<b>${s.siteName}</b><br>${formatDate(s.fuelDate)}`
    );

    markers.push(marker);
    if (label === "due") priorityMarkers.push(marker);
  });

  // Update metrics
  metricTotal.textContent = sites.length;
  metricDue.textContent = countDue;
  metricTomorrow.textContent = countTomorrow;
  metricAfter.textContent = countAfter;

  // Auto zoom
  if (priorityMarkers.length > 0) {
    map.fitBounds(L.featureGroup(priorityMarkers).getBounds().pad(0.4));
  } else if (markers.length > 0) {
    map.fitBounds(L.featureGroup(markers).getBounds().pad(0.3));
  }

  // Populate due table
  dueList.innerHTML = "";
  if (dueSites.length === 0) {
    dueList.innerHTML = `<li class="empty-row">No sites due today.</li>`;
  } else {
    dueSites.forEach((s) => {
      const li = document.createElement("li");
      li.className = "site-item";
      li.innerHTML = `
        <div class="site-name">${s.siteName}</div>
        <div class="site-date">${formatDate(s.fuelDate)}</div>
      `;
      dueList.appendChild(li);
    });
  }
}

//-------------------------------------------------------------
// FETCH + MAIN LOGIC
//-------------------------------------------------------------
async function fetchAndRender() {
  try {
    toggleLoading(true);

    const response = await fetch(SHEET_URL);
    const text = await response.text();
    const rows = parseCsv(text);

    const sites = [];

    rows.forEach((row, i) => {
      if (i === 0) return; // Skip header

      const region = (row[COL.region] || "").trim().toLowerCase();
      if (region !== "central") return;

      const fuelDate = parseDate(row[COL.fuelDate]);
      if (!fuelDate) return; // Exclude non-date AJ

      const lat = parseFloat(row[COL.lat]);
      const lng = parseFloat(row[COL.lng]);
      if (isNaN(lat) || isNaN(lng)) return;

      sites.push({
        siteName: row[COL.siteName],
        lat,
        lng,
        fuelDate,
      });
    });

    renderSites(sites);
  } catch (err) {
    console.error(err);
    errorBanner.textContent = "Failed to load data.";
    errorBanner.classList.remove("hidden");
  } finally {
    toggleLoading(false);
  }
}

fetchAndRender();
