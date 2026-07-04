require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const { fetchGeocode, fetchAirQuality, fetchWeather7d } = require('./openmeteo');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Serve frontend from /src
app.use(express.static(path.join(__dirname, '..', 'src')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'geosustain', time: new Date().toISOString() });
});

app.get('/api/geocode', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'Missing q' });

    const data = await fetchGeocode(q);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

app.get('/api/aqi', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: 'Missing/invalid lat/lon' });
    }

    const data = await fetchAirQuality({ lat, lon });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

app.get('/api/weather7d', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: 'Missing/invalid lat/lon' });
    }

    const data = await fetchWeather7d({ lat, lon });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// Rule-based “AI” interpretation (no external model needed)
app.post('/api/interpret', async (req, res) => {
  try {
    const payload = req.body || {};
    const aqiBand = payload?.aqi?.band;
    const score = payload?.score;
    const tempMax7d = payload?.weather?.tMax7d;
    const wind = payload?.weather?.wind;
    const ozone = payload?.aqi?.ozone;
    const pm25 = payload?.aqi?.pm25;

    const messages = [];

    if (aqiBand === 'good') {
      messages.push('Air quality looks good—safe for most outdoor activities today.');
    } else if (aqiBand === 'moderate') {
      messages.push('Air quality is acceptable, but sensitive individuals may want to limit prolonged outdoor exertion.');
    } else if (aqiBand === 'unhealthy_sensitive') {
      messages.push('Air quality may be unhealthy for sensitive groups. Consider reducing time outdoors if you have asthma or other respiratory conditions.');
    } else if (aqiBand === 'unhealthy') {
      messages.push('Air quality is unhealthy. Avoid strenuous outdoor activity and consider staying indoors, especially during peak hours.');
    } else if (aqiBand === 'very_unhealthy') {
      messages.push('Air quality is very unhealthy—stay indoors as much as possible and follow local health guidance.');
    } else {
      messages.push('Check local conditions and consider limiting outdoor activity if you feel symptoms.');
    }

    if (typeof wind === 'number' && Number.isFinite(wind)) {
      if (wind < 2) messages.push('Low wind may reduce pollutant dispersion, keeping conditions worse for longer.');
      if (wind >= 2 && wind < 6) messages.push('Wind is moderate—pollutants may disperse gradually.');
      if (wind >= 6) messages.push('Higher winds may help disperse pollutants over time.');
    }

    if (typeof pm25 === 'number' && Number.isFinite(pm25) && pm25 > 35) {
      messages.push('PM2.5 is elevated, which can penetrate deeper into the lungs. Use caution during outdoor exercise.');
    }

    if (typeof ozone === 'number' && Number.isFinite(ozone) && ozone > 70) {
      messages.push('Ozone levels are elevated. Afternoon heat can worsen ozone—consider earlier outdoor plans.');
    }

    const scoreLine = typeof score === 'number' && Number.isFinite(score)
      ? `Your Climate Health Score is ${Math.round(score)}/100 today.`
      : 'Your Climate Health Score is currently unavailable.';

    const tempLine = typeof tempMax7d === 'number' && Number.isFinite(tempMax7d)
      ? `Over the next 7 days, the highest temperature is about ${Math.round(tempMax7d)}°C.`
      : null;

    const result = {
      headline: scoreLine,
      body: [...messages, ...(tempLine ? [tempLine] : [])].join(' ')
    };

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`GeoSustain server running on http://localhost:${port}`);
});

