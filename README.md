# GeoSustain — Interactive Disaster & Resource Tracker

GeoSustain is a public-facing hackathon MVP that visualizes localized environmental signals:
- **Interactive Leaflet map** centered on a searched city/region (or your location)
- **AQI-like marker color** using Open-Meteo air-quality metrics (no API keys)
- **7-day trend chart** (proxy: max temperature per day)
- **AI Smart Interpretation panel** (rule-based “AI” summary; no paid LLM key required)

Data sources (free):
- **Open-Meteo** Air Quality API + Weather API
- **OpenStreetMap** tiles via Leaflet

---

## Project structure
- `server/index.js` — Express backend that proxies Open-Meteo to avoid frontend CORS issues
- `server/openmeteo.js` — fetch helpers
- `src/index.html` — UI
- `src/app.js` — map + charts + interactions
- `src/styles.css` — small styles

---

## Quick start (local)

### 1) Install
```bash
npm install
```

### 2) Run
```bash
npm run dev
```

Open:
- http://localhost:3000

---

## Endpoints
Backend is served from the same origin.

- `GET /api/health`
- `GET /api/geocode?q=city`
- `GET /api/aqi?lat=...&lon=...`
- `GET /api/weather7d?lat=...&lon=...`
- `POST /api/interpret` — creates the interpretation text

---

## Deployment (recommended)

### Option A: Single host (works well for hackathons)
Deploy the whole project as a Node server (frontend is served as static files from `src/`).

- **Render** (Web Service)
- **Fly.io**

Typical command to start:
- `npm install`
- `npm run start`

### Option B: Frontend + backend split
Not required for this MVP. Backend currently serves frontend, which keeps CORS simple.

---

## Notes / hackathon-safe implementation details
- No API keys required for the MVP.
- The “AI” panel is intentionally **rule-based** to avoid key management.
- Leaflet CSS is included via CDN in `src/index.html`.

