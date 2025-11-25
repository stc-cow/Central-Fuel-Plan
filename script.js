//-------------------------------------------------------------
// CONFIG – Your Google Apps Script Live Fuel Plan JSON API
//-------------------------------------------------------------
const DATA_URL =
  "https://script.googleusercontent.com/macros/echo?user_content_key=AehSKLjQgBfExAaCrs1fPK2D13P-Q4wEl2lTVCfSlDDPmLAyyTwqnFUZKTIgvqFvMfNAhH0Hc1gkifmvyip_YHW_yUQpfm_FHRSC-3M8wcs5BLQ0TToBWQPlCCB2z5VdfhgvruGBQEADBHXU-9ul&lib=MgJeKj1MW7JeQ0FRIvHVq-CVVrHB_XxFM";

const ONE_DAY = 24 * 60 * 60 * 1000;

const COLOR = {
  DUE: "#fb6d5d",
  TOMORROW: "#ffc857",
  AFTER: "#ff9f1c",
  HEALTHY: "#3ad17c",
};

//-------------------------------------------------------------
// MAP INITIALIZATION – Saudi Arabia Bounds
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
const loader = document.getElementById("loader");
const errorBanner = document.getElementById("error");

function toggleLoading(state) {
  loader.classList.toggle("hidden", !state);
}

//-------------------------------------------------------------
// DATE HELPERS
//-------------------------------------------------------------
function parseDate(str) {
  if (!str) return null;
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
// RENDER SITES ON DASHBOARD
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

  // Update counters
  metricTotal.textContent = sites.length;
  metricDue.textContent = countDue;
  metricTomorrow.textContent = countTomorrow;
  metricAfter.textContent = countAfter;

  // Auto-zoom
  if (priority.length > 0) {
    map.fitBounds(L.featureGroup(priority).getBounds().pad(0.4));
  } else if (markers.length > 0) {
    map.fitBounds(L.featureGroup(markers).getBounds().pad(0.3));
  }

  // Populate due list
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
// FETCH LIVE FROM GOOGLE APPS SCRIPT JSON API
//-------------------------------------------------------------
async function fetchAndRender() {
  try {
    toggleLoading(true);

    const response = await fetch(DATA_URL);
    const json = await response.json();

    // The real data is inside json.files[0].data
    const raw = json?.files?.[0]?.data;

    if (!raw || !Array.isArray(raw)) {
      throw new Error("Invalid JSON structure");
    }

    const sites = raw
      .filter(
        (s) =>
          s.RegionName?.toLowerCase() === "central" &&
          ["ON-AIR", "IN PROGRESS", "IN-PROGRESS"].includes(
            s.COWStatus?.toUpperCase()
          )
      )
      .map((s) => ({
        siteName: s.siteName,
        lat: parseFloat(s.lat),
        lng: parseFloat(s.lng),
        fuelDate: parseDate(s.NextFuelingPlan),
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

