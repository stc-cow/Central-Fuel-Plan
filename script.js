// Approximate bounds for Saudi Arabia: [southWest, northEast]
const SAUDI_BOUNDS = [
  [16.0, 34.0],
  [33.5, 56.0],
];

// Base map
const map = L.map("map", {
  maxBounds: SAUDI_BOUNDS,
  maxBoundsViscosity: 0.7,
}).setView([23.8859, 45.0792], 5.4);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
  minZoom: 4,
  maxZoom: 12,
}).addTo(map);

const COLOR_GREEN = "#3ad17c";
const COLOR_YELLOW = "#ffc857";
const COLOR_RED = "#fb6d5d";

// Helpers
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function daysDiffFromToday(date) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / ONE_DAY_MS);
}

function getStatus(days) {
  if (days === null) return { status: "unknown", color: COLOR_GREEN };
  if (days <= 0) return { status: "due", color: COLOR_RED }; // today or overdue
  if (days <= 3) return { status: "warning", color: COLOR_YELLOW }; // 1-3 days
  return { status: "ok", color: COLOR_GREEN }; // >3 days
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

// Fetch data.json produced by Python script (or any compatible API)
fetch("data.json")
  .then((res) => res.json())
  .then((sites) => {
    renderDashboard(sites);
  })
  .catch((err) => {
    console.error("Failed to load data.json", err);
  });

function renderDashboard(sites) {
  const markers = [];
  const urgentMarkers = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let countDue = 0;
  let countTomorrow = 0;
  let countAfter = 0;

  const dueSites = [];

  sites.forEach((site) => {
    const lat = parseFloat(site.lat);
    const lng = parseFloat(site.lng);
    if (isNaN(lat) || isNaN(lng)) return;

    const date = parseDate(site.NextFuelingPlan);
    const days = daysDiffFromToday(date);
    const { status, color } = getStatus(days);

    if (days !== null) {
      if (days <= 0) countDue += 1;
      else if (days === 1) countTomorrow += 1;
      else if (days >= 2) countAfter += 1;
    }

    // Build marker
    const marker = L.circleMarker([lat, lng], {
      radius: 8,
      color,
      weight: 2,
      fillColor: color,
      fillOpacity: 0.85,
    }).addTo(map);

    const popupHtml = `
      <div style="font-size:12px;">
        <strong>${site.SiteName || "-"}</strong><br />
        ${site.CityName || "-"}<br />
        Fuel date: ${formatDate(date)}<br />
        Days remaining: ${days !== null ? days : "N/A"}
      </div>
    `;
    marker.bindPopup(popupHtml);

    markers.push({ layer: marker, status, days });

    if (status === "due" || status === "warning") {
      urgentMarkers.push(marker);
    }

    if (status === "due") {
      dueSites.push({
        ...site,
        date,
        days,
      });
    }
  });

  // Update metrics
  metricDue.textContent = countDue;
  metricTomorrow.textContent = countTomorrow;
  metricAfter.textContent = countAfter;

  // Auto-zoom to urgent sites if they exist, otherwise all markers
  if (urgentMarkers.length > 0) {
    const group = L.featureGroup(urgentMarkers);
    map.fitBounds(group.getBounds().pad(0.3));
  } else if (markers.length > 0) {
    const group = L.featureGroup(markers.map((m) => m.layer));
    map.fitBounds(group.getBounds().pad(0.3));
  }

  // Populate "Today & Due" list (sorted by date asc)
  dueSites.sort((a, b) => a.date - b.date);
  dueList.innerHTML = "";

  if (dueSites.length === 0) {
    const li = document.createElement("li");
    li.textContent = "No today / overdue sites. All good!";
    li.style.fontSize = "0.85rem";
    li.style.color = "#6b7280";
    dueList.appendChild(li);
    return;
  }

  dueSites.forEach((site) => {
    const li = document.createElement("li");
    li.className = "site-item";

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

    dueList.appendChild(li);
  });
}
