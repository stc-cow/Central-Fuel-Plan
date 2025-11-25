//-------------------------------------------------------------
// CONFIG
//-------------------------------------------------------------
const DATA_URL =
  "https://script.google.com/macros/s/AKfycbwmlFSbFAF1evWMhwSpPNRe4dE7VTmCVaIXMPNePm7FGxIQ76VNgSYnLZqGsa9zTlIe/exec";

const ONE_DAY = 24 * 60 * 60 * 1000;

const COLOR = {
  DUE: "#fb6d5d",
  TOMORROW: "#ffc857",
  AFTER: "#ff9f1c",
  HEALTHY: "#3ad17c",
};

//-------------------------------------------------------------
// MAP INITIALIZATION
//-------------------------------------------------------------
const map = L.map("map", {
  maxBounds: [
    [16.0, 34.0],
    [33.5, 56.0],
  ],
  maxBoundsViscosity: 0.8,
  minZoom: 5
}).setView([23.8859, 45.0792], 6);

L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  { attribution: "Tiles © Esri | Maxar" }
).addTo(map);

const markerLayer = L.layerGroup().addTo(map);

//-------------------------------------------------------------
// DOM ELEMENTS
//-------------------------------------------------------------
const metricTotal = document.getElementById("metric-total");
const metricDue = document.getElementById("metric-due");
const metricTomorrow = document.getElementById("metric-tomorrow");
const metricAfter = document.getElementById("metric-after");
const dueList = document.getElementById("due-list");

function parseDate(val) {
  if (!val) return null;

  const dt = new Date(val);
  if (isNaN(dt)) return null;

  dt.setHours(0, 0, 0, 0);
  return dt;
}

function dateDiff(dt) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!dt) return null;

  return Math.round((dt - today) / ONE_DAY);
}

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
  let priority = [];

  sites.forEach((s) => {
    const dt = parseDate(s.NextFuelingPlan);
    const days = dateDiff(dt);
    const { label, color } = getStatus(days);

    if (label === "due") countDue++;
    if (label === "tomorrow") countTomorrow++;
    if (label === "after") countAfter++;

    if (label === "due") dueSites.push(s);

    const marker = L.circleMarker([s.lat, s.lng], {
      radius: 9,
      color,
      fillColor: color,
      fillOpacity: 0.85,
      weight: 2,
    }).addTo(markerLayer);

    marker.bindPopup(`<b>${s.SiteName}</b><br>${s.NextFuelingPlan}`);

    markers.push(marker);
    if (label === "due") priority.push(marker);
  });

  metricTotal.textContent = sites.length;
  metricDue.textContent = countDue;
  metricTomorrow.textContent = countTomorrow;
  metricAfter.textContent = countAfter;

  // AUTO-ZOOM
  if (priority.length) {
    map.fitBounds(L.featureGroup(priority).getBounds().pad(0.5));
  } else if (markers.length) {
    map.fitBounds(L.featureGroup(markers).getBounds().pad(0.3));
  }

  // DUE LIST
  dueList.innerHTML = "";
  if (!dueSites.length) {
    dueList.innerHTML = `<li class="empty-row">No sites due today.</li>`;
  } else {
    dueSites.forEach((s) => {
      dueList.innerHTML += `
        <li class="site-item">
          <div class="site-name">${s.SiteName}</div>
          <div class="site-date">${s.NextFuelingPlan}</div>
        </li>`;
    });
  }
}

//-------------------------------------------------------------
// FETCH LIVE DATA
//-------------------------------------------------------------
async function fetchLiveData() {
  try {
    console.log("Fetching live data...");

    const res = await fetch(DATA_URL);
    const raw = await res.json();

    // FILTER ACCORDING TO YOUR BUSINESS RULES
    const filtered = raw
      .filter(r => r.regionname?.toLowerCase() === "central")
      .filter(r => ["ON-AIR", "IN PROGRESS"].includes(String(r.cowstatus).toUpperCase()))
      .filter(r => r.lat && r.lng)
      .filter(r => r.nextfuelingplan); // remove blanks

    console.log("Cleaned sites:", filtered.length);

    // Normalize fields
    const sites = filtered.map(s => ({
      SiteName: s.sitename,
      lat: Number(s.lat),
      lng: Number(s.lng),
      NextFuelingPlan: s.nextfuelingplan,
    }));

    renderSites(sites);

  } catch (err) {
    console.error("Failed to load live API:", err);
  }
}

fetchLiveData();
