// Load dataset for dashboard KPIs and map
fetch('data.json')
  .then((res) => res.json())
  .then((data) => buildDashboard(data))
  .catch((err) => {
    console.error('Failed to load data.json', err);
  });

function buildDashboard(data) {
  const cleaned = data
    .map((d) => ({
      ...d,
      date: new Date(d.NextFuelingPlan),
    }))
    .filter((d) => !isNaN(d.date));

  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const afterTomorrow = addDays(today, 2);

  document
    .getElementById('totalSites')
    .querySelector('.value').textContent = cleaned.length;

  const todayList = cleaned.filter((d) => isSameDay(d.date, today));
  document
    .getElementById('needFuelToday')
    .querySelector('.value').textContent = todayList.length;

  const tomorrowList = cleaned.filter((d) => isSameDay(d.date, tomorrow));
  document
    .getElementById('tomorrowFuel')
    .querySelector('.value').textContent = tomorrowList.length;

  const afterTomorrowList = cleaned.filter((d) => isSameDay(d.date, afterTomorrow));
  document
    .getElementById('afterTomorrowFuel')
    .querySelector('.value').textContent = afterTomorrowList.length;

  buildMap(cleaned, today, tomorrow, afterTomorrow);
}

function buildMap(data, today, tomorrow, afterTomorrow) {
  const map = L.map('map').setView([23.8859, 45.0792], 6);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
  }).addTo(map);

  data.forEach((site) => {
    if (!isValidCoordinate(site.lat) || !isValidCoordinate(site.lng)) {
      return;
    }

    let color = '#2E7D32'; // green - normal

    if (site.date < today) {
      color = '#C62828'; // red - overdue
    } else if (isSameDay(site.date, today)) {
      color = '#C62828'; // red - today
    } else if (isSameDay(site.date, tomorrow)) {
      color = '#FB8C00'; // orange - tomorrow
    } else if (isSameDay(site.date, afterTomorrow)) {
      color = '#FBC02D'; // yellow - after tomorrow
    }

    L.circleMarker([site.lat, site.lng], {
      radius: 8,
      fillColor: color,
      color,
      weight: 1,
      fillOpacity: 0.7,
    })
      .bindPopup(`<b>${site.SiteName}</b><br>${site.CityName}<br>${site.NextFuelingPlan}`)
      .addTo(map);
  });
}

function isSameDay(a, b) {
  return a.toDateString() === b.toDateString();
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isValidCoordinate(value) {
  return value !== null && value !== undefined && !Number.isNaN(Number(value));
}
