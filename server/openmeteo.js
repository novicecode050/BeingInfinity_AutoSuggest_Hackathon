const fetch = global.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1';

function mapToAQIBand({ pm25, ozone, temp }) {
  // Open-Meteo provides concentrations; there is no universal AQI from the same API.
  // We create a simple heuristic “AQI-like” band for UX.
  // PM2.5 and ozone are both weighted; temperature slightly increases ozone risk.

  const pm25Score = typeof pm25 === 'number' ? pm25 : 0; // µg/m³-ish
  const ozoneScore = typeof ozone === 'number' ? ozone : 0; // µg/m³-ish
  const t = typeof temp === 'number' ? temp : 20;

  const ozoneAdj = ozoneScore * (1 + Math.max(0, (t - 25)) * 0.01);

  // Combine into 0..500-ish scale
  const combined = pm25Score * 4 + ozoneAdj;

  // Bands roughly modeled to feel right:
  if (combined <= 120) return { aqiLike: 50, band: 'good' };
  if (combined <= 240) return { aqiLike: 100, band: 'moderate' };
  if (combined <= 360) return { aqiLike: 145, band: 'unhealthy_sensitive' };
  if (combined <= 480) return { aqiLike: 190, band: 'unhealthy' };
  if (combined <= 600) return { aqiLike: 250, band: 'very_unhealthy' };
  return { aqiLike: 300, band: 'very_unhealthy' };
}

async function fetchGeocode(q) {
  const url = new URL(`${OPEN_METEO_BASE}/search`);
  url.searchParams.set('name', q);
  url.searchParams.set('count', '5');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`Geocode failed: ${r.status}`);
  const data = await r.json();

  const results = (data?.results || []).map((x) => ({
    name: x.name,
    admin1: x.admin1,
    country: x.country,
    latitude: x.latitude,
    longitude: x.longitude,
    timezone: x.timezone
  }));

  return { query: q, results };
}

async function fetchAirQuality({ lat, lon }) {
  // Open-Meteo Air Quality API
  // Docs: https://open-meteo.com/en/docs/air-quality-api
  const url = new URL(`${OPEN_METEO_BASE}/air-quality`);
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('current', 'pm2_5,pm10,ozone');
  url.searchParams.set('timezone', 'UTC');

  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`Air quality failed: ${r.status}`);
  const data = await r.json();

  const current = data?.current || {};
  const pm25 = typeof current?.pm2_5 === 'number' ? current.pm2_5 : null;
  const pm10 = typeof current?.pm10 === 'number' ? current.pm10 : null;
  const ozone = typeof current?.ozone === 'number' ? current.ozone : null;

  // No temperature in this endpoint; band will still be okay.
  const temp = null;
  const band = mapToAQIBand({ pm25: pm25 ?? 0, ozone: ozone ?? 0, temp: temp ?? 20 });

  return {
    lat,
    lon,
    pm25,
    pm10,
    ozone,
    band: band.band,
    aqiLike: band.aqiLike,
    raw: data
  };
}

async function fetchWeather7d({ lat, lon }) {
  // Open-Meteo current weather + hourly for last 7 days is large.
  // We'll request daily to keep it lightweight.
  const url = new URL(`${OPEN_METEO_BASE}/forecast`);
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min');
  url.searchParams.set('current', 'wind_speed_10m');
  url.searchParams.set('timezone', 'UTC');

  // Air-quality-related dispersion hint: wind speed.
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`Weather failed: ${r.status}`);
  const data = await r.json();

  const daily = data?.daily || {};
  const tMaxArr = Array.isArray(daily?.temperature_2m_max) ? daily.temperature_2m_max : [];
  const tMax7d = tMaxArr.length ? Math.max(...tMaxArr.slice(0, 7)) : null;

  // 7-day trend data: take max temperature per day.
  const times = Array.isArray(daily?.time) ? daily.time.slice(0, 7) : [];
  const tSeries = tMaxArr.slice(0, 7);

  const wind = typeof data?.current?.wind_speed_10m === 'number' ? data.current.wind_speed_10m : null;

  return {
    lat,
    lon,
    wind,
    tMax7d,
    daily: {
      time: times,
      tMax: tSeries
    },
    raw: data
  };
}

module.exports = { fetchGeocode, fetchAirQuality, fetchWeather7d };

