//-------------------------------------------------------------
// CONFIG
//-------------------------------------------------------------
const DATA_URL = "data.json";

const ONE_DAY = 24 * 60 * 60 * 1000;

const COLOR = {
  DUE: "#fb6d5d",
  TOMORROW: "#ffc857",
  AFTER: "#ff9f1c",
  HEALTHY: "#3ad17c",
};

//-------------------------------------------------------------
// MAP
//-------------------------------------------------------------
const map = L.map("map", {
  maxBounds: [
    [16.0, 34.0],
    [33.5, 56.0],
  ],
  maxBoundsViscosity: 0.8,
  minZoom: 4,
}).setView([23.8859, 45.0792], 6);

L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    attribution: "Tiles © Esri | Maxar",
  }
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
const loader = document.getElementById("loader");
const errorBanner = document.getElementById("error");

function toggleLoading(state) {
  loader.classList.toggle("hidden", !state);
}

//-------------------------------------------------------------
// HELPERS
//-------------------------------------------------------------
function parseDate(str) {
  if (!str) return null;

  // If no year → append current year
  if (/^\d{1,2}-[A-Za-z]{3}$/i.test(str)) {
    const currentYear = new Date().getFullYear();
    str = `${str}-${currentYear}`;
  }

  const dt = new Date(str);
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

function formatDate(dt) {
  if (!dt) return "-";
  return dt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getStatus(days) {
  if (days === null) return { label: "unknown", color: COLOR.HEALTHY };
  if (days <= 0) return { label: "due", color: COLOR.DUE };
  if (days === 1) return { label: "tomorrow", color: COLOR.TOMORROW };
  if (days === 2) return { label: "after", color: COLOR.AFTER };
  return { label: "healthy", color: COLOR.HEALTHY };
}

//-------------------------------------------------------------
// RENDER
//-------------------------------------------------------------
function renderSites(sites) {
  markerLayer.clearLayers();

  let countDue = 0;
  let countTomorrow = 0;
  let countAfter = 0;

  const dueSites = [];
  const markers = [];
  const priority = [];

  sites.forEach((s) => {
    const days = dateDiff(s.fuelDate);
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

    markers.push(marker);
    if (label === "due") priority.push(marker);
  });

  // UPDATE METRICS
  metricTotal.textContent = sites.length;
  metricDue.textContent = countDue;
  metricTomorrow.textContent = countTomorrow;
  metricAfter.textContent = countAfter;

  // AUTO ZOOM
  if (priority.length > 0) {
    map.fitBounds(L.featureGroup(priority).getBounds().pad(0.4));
  } else if (markers.length > 0) {
    map.fitBounds(L.featureGroup(markers).getBounds().pad(0.3));
  }

  // POPULATE DUE LIST
  dueList.innerHTML = "";
  if (dueSites.length === 0) {
    dueList.innerHTML = `<li class="empty-row">No sites due today.</li>`;
  } else {
    dueSites.forEach((s) => {
      dueList.innerHTML += `
        <li class="site-item">
          <div class="site-name">${s.siteName}</div>
          <div class="site-date">${formatDate(s.fuelDate)}</div>
        </li>`;
    });
  }
}

//-------------------------------------------------------------
// FETCH FROM data.json
//-------------------------------------------------------------
async function fetchAndRender() {
  try {
    toggleLoading(true);

    const response = await fetch(DATA_URL);
    const json = await response.json();

    const sites = json.map((item) => ({
      siteName: item.SiteName,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lng),
      fuelDate: parseDate(item.NextFuelingPlan),
    }));

    renderSites(sites);

  } catch (err) {
    console.error(err);
    errorBanner.classList.remove("hidden");
    errorBanner.textContent = "Failed to load data.";
  } finally {
    toggleLoading(false);
  }
}

fetchAndRender();
