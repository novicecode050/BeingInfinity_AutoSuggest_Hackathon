const $ = (id) => document.getElementById(id);

const searchInput = $('searchInput');
const searchResults = $('searchResults');
const resultsList = $('resultsList');

const locationLabel = $('locationLabel');
const coordsLabel = $('coordsLabel');

const aqiBand = $('aqiBand');
const aqiValue = $('aqiValue');
const scoreEl = $('score');
const scoreBadge = $('scoreBadge');

const pm25El = $('pm25');
const pm10El = $('pm10');
const ozoneEl = $('ozone');
const windEl = $('wind');

const aiHeadlineEl = $('aiHeadline');
const aiBodyEl = $('aiBody');

let map;
let marker;
let trendChart;

function setLoading(v) {
  searchInput.disabled = v;
  $('useMyLocation').disabled = v;
}

function hideResults() {
  searchResults.classList.add('hidden');
}

function showResults() {
  searchResults.classList.remove('hidden');
}

function bandToColor(band) {
  const map = {
    good: '#22c55e',
    moderate: '#84cc16',
    unhealthy_sensitive: '#f59e0b',
    unhealthy: '#ef4444',
    very_unhealthy: '#7f1d1d'
  };
  return map[band] || '#94a3b8';
}

function scoreFromMetrics({ aqi, weather }) {
  // Quick UX heuristic: higher AQI-like => lower score.
  const aqiLike = typeof aqi?.aqiLike === 'number' ? aqi.aqiLike : null;
  const wind = typeof weather?.wind === 'number' ? weather.wind : null;

  let s = 92;
  if (aqiLike != null) {
    s -= (aqiLike / 300) * 85; // scale
  }
  if (wind != null && wind < 2) s -= 6;
  if (wind != null && wind >= 6) s += 3;

  // Clamp
  s = Math.max(0, Math.min(100, s));
  return s;
}

function formatNum(v, digits = 1) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

function initMap() {
  if (map) return;
  map = L.map('map').setView([20.5937, 78.9629], 4);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
}

function ensureMarkerColor(band) {
  const color = bandToColor(band);
  const iconHtml = `
    <div style="
      width: 18px; height: 18px; border-radius: 9999px;
      background: ${color}; box-shadow: 0 0 0 4px rgba(148,163,184,.18);
      border: 2px solid rgba(255,255,255,.65);
    "></div>
  `;

  const icon = L.divIcon({
    html: iconHtml,
    className: '',
    iconSize: [18, 18]
  });

  if (marker) {
    marker.setIcon(icon);
  } else {
    marker = L.marker(map.getCenter(), { icon }).addTo(map);
  }
}

async function api(url, options) {
  const r = await fetch(url, options);
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Request failed: ${r.status} ${txt}`);
  }
  return r.json();
}

async function loadForLatLon(lat, lon, labelText) {
  initMap();
  setLoading(true);

  try {
    locationLabel.textContent = labelText || `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    coordsLabel.textContent = `Lat ${lat.toFixed(4)} • Lon ${lon.toFixed(4)}`;

    const [aqi, weather7d] = await Promise.all([
      api(`/api/aqi?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`),
      api(`/api/weather7d?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`)
    ]);

    // Paint marker
    ensureMarkerColor(aqi?.band);
    const bandText = (aqi?.band || '').replace(/_/g, ' ').toUpperCase();
    aqiBand.textContent = bandText || '—';
    aqiValue.textContent = typeof aqi?.aqiLike === 'number' ? Math.round(aqi.aqiLike) : '—';

    pm25El.textContent = formatNum(aqi?.pm25);
    pm10El.textContent = formatNum(aqi?.pm10);
    ozoneEl.textContent = formatNum(aqi?.ozone);
    windEl.textContent = formatNum(weather7d?.wind, 1);

    // Score
    const score = scoreFromMetrics({ aqi, weather: weather7d });
    scoreEl.textContent = `${Math.round(score)}`;

    const badgeColor = score >= 75 ? 'rgba(34,197,94,.25)' : score >= 55 ? 'rgba(132,204,22,.22)' : score >= 35 ? 'rgba(245,158,11,.22)' : 'rgba(239,68,68,.22)';
    scoreBadge.style.background = badgeColor;

    // Move marker and recenter
    map.setView([lat, lon], 12);
    if (marker) marker.setLatLng([lat, lon]);

    // Chart (temperature max)
    const time = weather7d?.daily?.time || [];
    const tMax = weather7d?.daily?.tMax || [];

    const ctx = $('trendChart');
    const dataset = tMax.map((x) => (typeof x === 'number' ? x : null));


    // Keep a consistent 7-day window
    const labels7 = Array.isArray(time) ? time.slice(0, 7) : [];
    const data7 = Array.isArray(dataset) ? dataset.slice(0, 7) : [];

    if (trendChart) {
      trendChart.data.labels = labels7;
      trendChart.data.datasets[0].data = data7;

      trendChart.update();
    } else {
      trendChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels7,
          datasets: [
            {

              label: 'Max Temp (°C)',
              data: dataset,
              borderColor: '#34d399',
              backgroundColor: 'rgba(52,211,153,.15)',
              tension: 0.35,
              pointRadius: 3,
              pointHoverRadius: 5
            }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { labels: { color: '#94a3b8' } },
            tooltip: { enabled: true }
          },
          scales: {
            x: {
              ticks: { color: '#94a3b8' },
              grid: { color: 'rgba(148,163,184,.12)' }
            },
            y: {
              ticks: { color: '#94a3b8' },
              grid: { color: 'rgba(148,163,184,.12)' }
            }
          }
        }
      });
    }

    // “AI” interpretation
    const interpretation = await api('/api/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aqi, weather: weather7d, score })
    });

    aiHeadlineEl.textContent = interpretation?.headline || '—';
    aiBodyEl.textContent = interpretation?.body || '—';

  } catch (e) {
    console.error(e);
    aiHeadlineEl.textContent = 'Unable to load data';
    aiBodyEl.textContent = String(e?.message || e);
  } finally {
    setLoading(false);
  }
}

async function searchLocations(q) {
  if (!q || q.length < 2) return [];
  const data = await api(`/api/geocode?q=${encodeURIComponent(q)}`);
  return data?.results || [];
}

function renderResults(items) {
  resultsList.innerHTML = '';
  if (!items.length) {
    const div = document.createElement('div');
    div.className = 'px-3 py-2 text-sm text-slate-400';
    div.textContent = 'No matches';
    resultsList.appendChild(div);
    return;
  }

  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'w-full px-3 py-2 text-left hover:bg-slate-900 transition';
    btn.innerHTML = `<div class="text-sm font-medium">${item.name}, ${item.admin1 || ''}</div>
                      <div class="text-xs text-slate-400">${item.country} • ${item.latitude.toFixed(3)}, ${item.longitude.toFixed(3)}</div>`;
    btn.addEventListener('click', () => {
      hideResults();
      loadForLatLon(item.latitude, item.longitude, `${item.name}${item.admin1 ? ', ' + item.admin1 : ''}, ${item.country}`);
    });
    resultsList.appendChild(btn);
  });
}

let searchTimer;
searchInput.addEventListener('input', async () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (!q) {
    hideResults();
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      const items = await searchLocations(q);
      renderResults(items);
      showResults();
    } catch (e) {
      console.error(e);
      hideResults();
    }
  }, 250);
});

document.addEventListener('click', (ev) => {
  const within = ev.target === searchInput || (ev.target && searchResults.contains(ev.target));
  if (!within) hideResults();
});

$('useMyLocation').addEventListener('click', async () => {
  initMap();
  if (!navigator.geolocation) {
    aiHeadlineEl.textContent = 'Geolocation not supported';
    aiBodyEl.textContent = 'Your browser does not support geolocation.';
    return;
  }

  setLoading(true);
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      loadForLatLon(lat, lon, 'Your location');
    },
    (err) => {
      setLoading(false);
      aiHeadlineEl.textContent = 'Location permission denied';
      aiBodyEl.textContent = String(err?.message || err);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

// Default load: quick start
loadForLatLon(28.6139, 77.2090, 'Delhi, India');

