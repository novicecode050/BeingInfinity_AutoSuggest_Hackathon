import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import axios from 'axios';
import L from 'leaflet';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const getAQIColor = (aqi) => {
  if (aqi <= 50) return '#00E400'; // Good
  if (aqi <= 100) return '#FFFF00'; // Moderate
  if (aqi <= 150) return '#FF7E00'; // Sensitive
  if (aqi <= 200) return '#FF0000'; // Unhealthy
  if (aqi <= 300) return '#8F3F97'; // Very Unhealthy
  return '#7E0023'; // Hazardous
};

const getAQILabel = (aqi) => {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Sensitive';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
};

function MapController({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.setView(position, 10);
  }, [position, map]);
  return null;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Simplified AQI calculation based on PM2.5
function calculateAQI_PM25(pm25) {
  const v = pm25 || 0;
  if (v <= 12) return Math.round((v / 12) * 50);
  if (v <= 35.4) return Math.round(((v - 12) / (35.4 - 12)) * 50 + 50);
  if (v <= 55.4) return Math.round(((v - 35.4) / (55.4 - 35.4)) * 50 + 100);
  if (v <= 150.4) return Math.round(((v - 55.4) / (150.4 - 55.4)) * 50 + 150);
  if (v <= 250.4) return Math.round(((v - 150.4) / (250.4 - 150.4)) * 50 + 200);
  if (v <= 350.4) return Math.round(((v - 250.4) / (350.4 - 250.4)) * 50 + 300);
  return 400;
}

// Score is computed from selected metrics and weights.
function calculateClimateScoreFromMetrics({ aqi, uvIndex, temperature, humidity, windSpeed }, weights) {
  // Metric -> normalized penalty contribution in [0..100] scaled by weight.
  // Higher score is better.
  let base = 100;

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 1;

  const w = (k) => weights[k] / totalWeight;

  // AQI penalty: anything above 100 reduces score progressively.
  if (typeof aqi === 'number') {
    if (aqi > 100) base -= (aqi - 100) * 0.35 * w('aqi');
    else base -= 0 * w('aqi');
  }

  // UV penalty: above 5 reduces score
  if (typeof uvIndex === 'number') {
    if (uvIndex > 5) base -= (uvIndex - 5) * 1.5 * w('uv');
  }

  // Temperature penalty: above 30 reduces score
  if (typeof temperature === 'number') {
    if (temperature > 30) base -= (temperature - 30) * 0.8 * w('temp');
  }

  // Humidity penalty: very low or very high humidity can stress health.
  if (typeof humidity === 'number') {
    const dist = Math.min(Math.abs(humidity - 45), Math.abs(humidity - 60));
    // penalty grows as humidity deviates from mid-range.
    base -= clamp(dist, 0, 30) * 0.4 * w('humidity');
  }

  // Wind speed isn't a direct health metric, but low wind can trap pollutants.
  if (typeof windSpeed === 'number') {
    if (windSpeed < 10) base -= (10 - windSpeed) * 0.4 * w('wind');
  }

  return clamp(Math.round(base), 0, 100);
}

function buildInsightFallback({ aqi, uvIndex, temperature, humidity }) {
  const label = getAQILabel(aqi);
  const parts = [];

  if (aqi <= 50) {
    parts.push(`🌱 Great news! Air quality is ${label} (AQI: ${aqi}). Enjoy your day outside.`);
  } else if (aqi <= 100) {
    parts.push(`😊 Air quality is ${label} (AQI: ${aqi}). Generally safe—consider extra care if you’re sensitive.`);
  } else if (aqi <= 150) {
    parts.push(`⚠️ Air quality is ${label} (AQI: ${aqi}). Sensitive groups should limit prolonged outdoor exertion.`);
  } else if (aqi <= 200) {
    parts.push(`🚨 Air quality is ${label} (AQI: ${aqi}). Avoid intense outdoor workouts today if possible.`);
  } else {
    parts.push(`☠️ Warning—air quality is ${label} (AQI: ${aqi}). Stay indoors and keep windows closed.`);
  }

  if (typeof uvIndex === 'number' && uvIndex > 7) {
    parts.push(`☀️ UV index is high (${uvIndex}). Use sunscreen and protect your skin.`);
  }

  if (typeof temperature === 'number' && temperature > 30) {
    parts.push(`🌡️ Temperature is ${temperature}°C. Hydrate and avoid peak sun hours.`);
  }

  if (typeof humidity === 'number' && (humidity > 70 || humidity < 30)) {
    parts.push(`💧 Humidity is ${humidity}%. Consider adjusting your activity and staying comfortable.`);
  }

  return parts.join(' ');
}

async function tryGenerateLLMInsight({ prompt, apiKey, endpoint }) {
  if (!apiKey || !endpoint) return null;

  // Provider-agnostic contract: tries an OpenAI-compatible chat endpoint by default.
  // You can change endpoint in future without touching UI logic.
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a friendly climate health companion. Keep it empathetic and actionable. 2-4 short sentences.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  // OpenAI-compatible
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content.trim() : null;
}

function makeNeighOffsets(radiusKm) {
  // Very small offsets approximated using rough conversions.
  // 1 degree lat ~ 111 km
  const dLat = radiusKm / 111;
  // 1 degree lon depends on latitude later, so we just use a grid and scale lon by cos(lat) when applied.
  const dLonApprox = radiusKm / 111;

  return [
    { name: 'Center', dy: 0, dx: 0 },
    { name: 'North', dy: dLat, dx: 0 },
    { name: 'South', dy: -dLat, dx: 0 },
    { name: 'East', dy: 0, dx: dLonApprox },
    { name: 'West', dy: 0, dx: -dLonApprox },
    { name: 'NE', dy: dLat / 1.4, dx: dLonApprox / 1.4 },
    { name: 'NW', dy: dLat / 1.4, dx: -dLonApprox / 1.4 },
    { name: 'SE', dy: -dLat / 1.4, dx: dLonApprox / 1.4 },
    { name: 'SW', dy: -dLat / 1.4, dx: -dLonApprox / 1.4 }
  ];
}

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [position, setPosition] = useState([20.5937, 78.9629]); // Default: India center
  const [locationName, setLocationName] = useState('India');

  const [airQualityData, setAirQualityData] = useState(null);
  const [weatherData, setWeatherData] = useState(null);
  const [historicalData, setHistoricalData] = useState(null);

  const [loading, setLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState('');

  // Interactive score
  const [scoreWeights, setScoreWeights] = useState({
    aqi: 0.45,
    uv: 0.2,
    temp: 0.2,
    humidity: 0.1,
    wind: 0.05
  });
  const [activeMetrics, setActiveMetrics] = useState({
    aqi: true,
    uv: true,
    temp: true,
    humidity: true,
    wind: false
  });

  const computedWeights = useMemo(() => {
    const out = { ...scoreWeights };
    Object.keys(out).forEach((k) => {
      if (!activeMetrics[k]) out[k] = 0;
    });
    return out;
  }, [scoreWeights, activeMetrics]);

  const aqiNow = useMemo(() => {
    return airQualityData ? calculateAQI_PM25(airQualityData.pm2_5) : 0;
  }, [airQualityData]);

  const scoreNow = useMemo(() => {
    const temperature = weatherData ? weatherData.temperature_2m : undefined;
    const humidity = weatherData ? weatherData.relative_humidity_2m : undefined;
    const windSpeed = weatherData ? weatherData.wind_speed_10m : undefined;
    const uvIndex = weatherData ? weatherData.uv_index : undefined;

    return calculateClimateScoreFromMetrics(
      {
        aqi: aqiNow,
        uvIndex,
        temperature,
        humidity,
        windSpeed
      },
      computedWeights
    );
  }, [airQualityData, weatherData, aqiNow, computedWeights]);

  // Micro-climate neighborhood drill-down
  const [neighborhoodRadiusKm, setNeighborhoodRadiusKm] = useState(1);
  const [neighborhoodStats, setNeighborhoodStats] = useState(null);
  const [neighborhoodLoading, setNeighborhoodLoading] = useState(false);
  const neighborhoodAbortRef = useRef(null);

  // Cross-data correlation timeline
  const [correlationMode, setCorrelationMode] = useState('sync'); // 'sync' | 'aqi'

  // Location init
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition([pos.coords.latitude, pos.coords.longitude]);
      },
      () => {}
    );
  }, []);

  // Fetch data on location changes
  useEffect(() => {
    if (!position) return;

    fetchData(position[0], position[1]);
    fetchNeighborhood(position[0], position[1], neighborhoodRadiusKm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);

  // Update neighborhood stats on radius change
  useEffect(() => {
    if (!position) return;
    fetchNeighborhood(position[0], position[1], neighborhoodRadiusKm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [neighborhoodRadiusKm]);

  const fetchData = async (lat, lon) => {
    setLoading(true);
    try {
      const airQualityResponse = await axios.get(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone&timezone=auto`
      );

      const weatherResponse = await axios.get(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,uv_index&timezone=auto`
      );

      const historicalResponseAQ = await axios.get(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&start_date=${getDateDaysAgo(7)}&end_date=${getTodayDate()}&daily=pm2_5,pm10,ozone&timezone=auto`
      );

      const historicalResponseWX = await axios.get(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,relative_humidity_2m_max,uv_index_max,wind_speed_10m_max&timezone=auto`
      );

      setAirQualityData(airQualityResponse.data.current);
      setWeatherData(weatherResponse.data.current);

      // Build unified timeline for correlation widget
      const wxDaily = historicalResponseWX.data.daily;
      const aqDaily = historicalResponseAQ.data.daily;

      const dates = (aqDaily?.time || wxDaily?.time || []).slice(-8);

      const unified = {
        time: dates,
        pm2_5: dates.map((t) => (aqDaily?.pm2_5 || []).at(aqDaily?.time?.indexOf(t)) ?? null),
        pm10: dates.map((t) => (aqDaily?.pm10 || []).at(aqDaily?.time?.indexOf(t)) ?? null),
        ozone: dates.map((t) => (aqDaily?.ozone || []).at(aqDaily?.time?.indexOf(t)) ?? null),
        temperature_2m_max: dates.map((t) => (wxDaily?.temperature_2m_max || []).at(wxDaily?.time?.indexOf(t)) ?? null),
        humidity_2m_max: dates.map((t) => (wxDaily?.relative_humidity_2m_max || []).at(wxDaily?.time?.indexOf(t)) ?? null),
        uv_index_max: dates.map((t) => (wxDaily?.uv_index_max || []).at(wxDaily?.time?.indexOf(t)) ?? null),

        wind_speed_10m_max: dates.map((t) => (wxDaily?.wind_speed_10m_max || []).at(wxDaily?.time?.indexOf(t)) ?? null)
      };

      setHistoricalData(unified);

      // AI insight (LLM if available, otherwise fallback)
      const aqi = calculateAQI_PM25(airQualityResponse.data.current?.pm2_5);

      generateAIInsight({
        air: airQualityResponse.data.current,
        weather: weatherResponse.data.current,
        aqi
      });
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchNeighborhood = async (lat, lon, radiusKm) => {
    // Local drill-down by sampling nearby points.
    // We fetch air quality current for multiple offset points and summarize.
    setNeighborhoodLoading(true);

    if (neighborhoodAbortRef.current) neighborhoodAbortRef.current.abort?.();
    neighborhoodAbortRef.current = new AbortController();
    const signal = neighborhoodAbortRef.current.signal;

    try {
      const offsets = makeNeighOffsets(radiusKm);
      const cosLat = Math.cos((lat * Math.PI) / 180) || 1;

      const points = offsets
        .map((o) => {
          const sampleLat = lat + o.dy;
          const sampleLon = lon + o.dx / cosLat;
          return { name: o.name, lat: sampleLat, lon: sampleLon };
        })
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));

      const promises = points.map((p) =>
        axios.get(
          `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${p.lat}&longitude=${p.lon}&current=pm2_5,pm10&timezone=auto`,
          { signal }
        )
      );

      const results = await Promise.allSettled(promises);

      const samples = results
        .map((r, idx) => {
          const p = points[idx];
          if (r.status !== 'fulfilled') return null;
          const current = r.value.data?.current;
          const pm25 = current?.pm2_5 ?? null;
          const aqi = pm25 === null ? null : calculateAQI_PM25(pm25);
          return {
            name: p.name,
            lat: p.lat,
            lon: p.lon,
            pm25,
            aqi,
            pm10: current?.pm10 ?? null
          };
        })
        .filter(Boolean);

      const validAQI = samples.map((s) => s.aqi).filter((v) => typeof v === 'number');
      const min = validAQI.length ? Math.min(...validAQI) : 0;
      const max = validAQI.length ? Math.max(...validAQI) : 0;
      const avg = validAQI.length ? validAQI.reduce((a, b) => a + b, 0) / validAQI.length : 0;

      setNeighborhoodStats({
        radiusKm,
        samples,
        minAQI: Math.round(min),
        maxAQI: Math.round(max),
        avgAQI: Math.round(avg)
      });
    } catch (e) {
      if (e?.name === 'CanceledError' || e?.name === 'AbortError') return;
      console.error('Neighborhood error:', e);
    } finally {
      setNeighborhoodLoading(false);
    }
  };

  const getDateDaysAgo = (days) => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  };

  const getTodayDate = () => {
    return new Date().toISOString().split('T')[0];
  };

  const generateAIInsight = async ({ air, weather, aqi }) => {
    const uv = weather?.uv_index;
    const temp = weather?.temperature_2m;
    const humidity = weather?.relative_humidity_2m;

    const fallback = buildInsightFallback({ aqi, uvIndex: uv, temperature: temp, humidity });

    // LLM API layer (optional)
    const apiKey = import.meta.env.VITE_LLM_API_KEY;
    const endpoint = import.meta.env.VITE_LLM_ENDPOINT;

    // If no key/endpoint, fallback immediately.
    if (!apiKey || !endpoint) {
      setAiInsight(fallback);
      return;
    }

    try {
      setAiInsight('Analyzing with AI Health Companion...');

      const prompt =
        `Current location AQI (approx from PM2.5): ${aqi}.` +
        ` PM2.5: ${air?.pm2_5 ?? 'n/a'} µg/m³.` +
        ` UV index: ${uv ?? 'n/a'}.` +
        ` Temperature: ${temp ?? 'n/a'}°C.` +
        ` Humidity: ${humidity ?? 'n/a'}%.` +
        ` Give an empathetic, human-friendly health summary and 2 actionable suggestions for today.`;

      const llm = await tryGenerateLLMInsight({ prompt, apiKey, endpoint });
      setAiInsight(llm || fallback);
    } catch (err) {
      console.error('LLM insight failed:', err);
      setAiInsight(fallback);
    }
  };

  const searchLocation = async () => {
    if (!searchQuery) return;
    try {
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`
      );
      if (response.data && response.data.length > 0) {
        const { lat, lon, display_name } = response.data[0];
        setPosition([parseFloat(lat), parseFloat(lon)]);
        setLocationName(display_name);
      }
    } catch (error) {
      console.error('Error searching location:', error);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') searchLocation();
  };

  const currentAQI = aqiNow;

  // Charts
  const correlationLabels = useMemo(() => {
    if (!historicalData?.time?.length) return [];
    return historicalData.time.map((date) =>
      new Date(date).toLocaleDateString('en', { month: 'short', day: 'numeric' })
    );
  }, [historicalData]);

  const corrChartData = useMemo(() => {
    if (!historicalData) return null;

    const pm25 = historicalData.pm2_5 || [];
    const temp = historicalData.temperature_2m_max || [];
    const humidity = historicalData.humidity_2m_max || [];
    const uv = historicalData.uv_index_max || [];

    const normalize = (arr, invert = false) => {
      const vals = arr.map((v) => (typeof v === 'number' ? v : null)).filter((v) => v !== null);
      const min = vals.length ? Math.min(...vals) : 0;
      const max = vals.length ? Math.max(...vals) : 1;
      const denom = max - min || 1;
      return arr.map((v) => {
        const n = typeof v === 'number' ? v : null;
        if (n === null) return null;
        const t = (n - min) / denom;
        return invert ? 1 - t : t;
      });
    };

    // Normalize to compare trends regardless of unit.
    // Invert UV/Temperature/Humidity so higher (worse) -> higher penalty -> lower normalized health.
    const aqiProxy = normalize(pm25, true); // higher PM2.5 should look worse
    const tempProxy = normalize(temp, true);
    const uvProxy = normalize(uv, true);
    const humProxy = normalize(humidity, true);

    return {
      labels: correlationLabels,
      datasets: [
        {
          label: 'Air Pollution (PM2.5 health trend)',
          data: aqiProxy,
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59,130,246,0.12)',
          tension: 0.35,
          fill: true,
          yAxisID: 'y'
        },
        {
          label: 'Temperature (health trend)',
          data: tempProxy,
          borderColor: '#F59E0B',
          backgroundColor: 'rgba(245,158,11,0.12)',
          tension: 0.35,
          fill: true,
          yAxisID: 'y'
        },
        {
          label: 'UV (health trend)',
          data: uvProxy,
          borderColor: '#A855F7',
          backgroundColor: 'rgba(168,85,247,0.12)',
          tension: 0.35,
          fill: true,
          yAxisID: 'y'
        },
        {
          label: 'Humidity (health trend)',
          data: humProxy,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16,185,129,0.12)',
          tension: 0.35,
          fill: true,
          yAxisID: 'y'
        }
      ]
    };
  }, [historicalData, correlationLabels]);

  const correlationOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'Cross-Data Correlation: Weather + Air Quality Sync (normalized)' }
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 1,
        ticks: {
          callback: function (value) {
            // Normalize scale label
            return `${Math.round(value * 100)}%`;
          }
        },
        title: { display: true, text: 'Health Trend (higher = healthier)' }
      }
    }
  };

  const chartDataAQ = useMemo(() => {
    if (!historicalData) return null;
    return {
      labels: correlationLabels,
      datasets: [
        {
          label: 'PM2.5 (µg/m³)',
          data: historicalData.pm2_5 || [],
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.4,
          fill: true
        },
        {
          label: 'PM10 (µg/m³)',
          data: historicalData.pm10 || [],
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          tension: 0.4,
          fill: true
        }
      ]
    };
  }, [historicalData, correlationLabels]);

  const chartOptionsAQ = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: '7-Day Air Quality Trends' }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: 'Concentration (µg/m³)' }
      }
    }
  };

  const scoreColor = scoreNow >= 70 ? '#10B981' : scoreNow >= 40 ? '#F59E0B' : '#EF4444';

  // Build neighborhood markers for display
  const neighborhoodMarkers = useMemo(() => {
    if (!position || !neighborhoodStats?.samples?.length) return [];
    return neighborhoodStats.samples
      .filter((s) => typeof s.aqi === 'number')
      .map((s, idx) => ({
        id: `${s.name}-${idx}`,
        lat: s.lat,
        lon: s.lon,
        aqi: s.aqi,
        name: s.name
      }));
  }, [position, neighborhoodStats]);

  const currentMarkerIcon = useMemo(() => {
    return L.divIcon({
      className: 'aqi-marker',
      html: `<div class="w-8 h-8 rounded-full border-2 border-white shadow-lg" style="background-color: ${getAQIColor(currentAQI)}"></div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });
  }, [currentAQI]);

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Sidebar (Dashboard-like) */}
      <div className="w-80 bg-white shadow-xl p-6 overflow-y-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">🌍 GeoSustain</h1>
          <p className="text-sm text-gray-600">Interactive Disaster & Resource Tracker</p>
        </div>

        {/* Search */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Search Location</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter city or region..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={searchLocation}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              🔍
            </button>
          </div>
        </div>

        {/* Micro-Climate Neighborhood Drill-down */}
        <div className="mb-6 bg-gradient-to-r from-emerald-50 to-blue-50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-700">Micro-Climate Drill-down</h2>
            <span className="text-xs text-gray-600">{neighborhoodRadiusKm}km</span>
          </div>

          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-700 mb-2">Radius</label>
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.5}
              value={neighborhoodRadiusKm}
              onChange={(e) => setNeighborhoodRadiusKm(parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-[11px] text-gray-600 mt-1">
              <span>0.5</span>
              <span>3</span>
            </div>
          </div>

          {neighborhoodLoading ? (
            <p className="text-sm text-gray-700">Sampling neighborhood pockets...</p>
          ) : neighborhoodStats ? (
            <div className="space-y-2">
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Avg AQI</span>: {neighborhoodStats.avgAQI} ({getAQILabel(neighborhoodStats.avgAQI)})
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Spread</span>: {neighborhoodStats.minAQI} → {neighborhoodStats.maxAQI}
              </p>
              <p className="text-xs text-gray-600">Shows local variation by sampling nearby coordinates.</p>
            </div>
          ) : (
            <p className="text-sm text-gray-700">Select a radius to see local AQI variation.</p>
          )}
        </div>

        {/* Interactive Climate Health Score Widget */}
        <div className="mb-6 bg-gradient-to-r from-blue-50 to-green-50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-gray-700">Climate Health Score</h2>
            <span className="text-xs text-gray-600">/100</span>
          </div>

          <div className="relative w-full h-32 mb-4">
            <svg className="w-full h-full" viewBox="0 0 100 50">
              <path
                d="M 10 40 A 30 30 0 0 1 90 40"
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="8"
              />
              <path
                d="M 10 40 A 30 30 0 0 1 90 40"
                fill="none"
                stroke={scoreColor}
                strokeWidth="8"
                strokeDasharray="188"
                strokeDashoffset={188 - (188 * scoreNow) / 100}
                className="transition-all duration-700"
              />
              <text x="50" y="30" textAnchor="middle" className="text-2xl font-bold fill-gray-800">
                {scoreNow}
              </text>
              <text x="50" y="45" textAnchor="middle" className="text-sm fill-gray-600">
                /100
              </text>
            </svg>
          </div>

          <div className="space-y-3">
            <div>
              <label className="flex items-center justify-between text-xs text-gray-700">
                <span>Include AQI</span>
                <input
                  type="checkbox"
                  checked={activeMetrics.aqi}
                  onChange={(e) => setActiveMetrics((s) => ({ ...s, aqi: e.target.checked }))}
                />
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={scoreWeights.aqi}
                onChange={(e) => setScoreWeights((s) => ({ ...s, aqi: parseFloat(e.target.value) }))}
                className="w-full"
                disabled={!activeMetrics.aqi}
              />
            </div>

            <div>
              <label className="flex items-center justify-between text-xs text-gray-700">
                <span>Include UV</span>
                <input
                  type="checkbox"
                  checked={activeMetrics.uv}
                  onChange={(e) => setActiveMetrics((s) => ({ ...s, uv: e.target.checked }))}
                />
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={scoreWeights.uv}
                onChange={(e) => setScoreWeights((s) => ({ ...s, uv: parseFloat(e.target.value) }))}
                className="w-full"
                disabled={!activeMetrics.uv}
              />
            </div>

            <div>
              <label className="flex items-center justify-between text-xs text-gray-700">
                <span>Include Temperature</span>
                <input
                  type="checkbox"
                  checked={activeMetrics.temp}
                  onChange={(e) => setActiveMetrics((s) => ({ ...s, temp: e.target.checked }))}
                />
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={scoreWeights.temp}
                onChange={(e) => setScoreWeights((s) => ({ ...s, temp: parseFloat(e.target.value) }))}
                className="w-full"
                disabled={!activeMetrics.temp}
              />
            </div>

            <div>
              <label className="flex items-center justify-between text-xs text-gray-700">
                <span>Include Humidity</span>
                <input
                  type="checkbox"
                  checked={activeMetrics.humidity}
                  onChange={(e) => setActiveMetrics((s) => ({ ...s, humidity: e.target.checked }))}
                />
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={scoreWeights.humidity}
                onChange={(e) => setScoreWeights((s) => ({ ...s, humidity: parseFloat(e.target.value) }))}
                className="w-full"
                disabled={!activeMetrics.humidity}
              />
            </div>

            <div>
              <label className="flex items-center justify-between text-xs text-gray-700">
                <span>Include Wind (optional)</span>
                <input
                  type="checkbox"
                  checked={activeMetrics.wind}
                  onChange={(e) => setActiveMetrics((s) => ({ ...s, wind: e.target.checked }))}
                />
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={scoreWeights.wind}
                onChange={(e) => setScoreWeights((s) => ({ ...s, wind: parseFloat(e.target.value) }))}
                className="w-full"
                disabled={!activeMetrics.wind}
              />
            </div>
          </div>

          <div className="mt-3 text-xs text-gray-600">
            Updates instantly when you toggle metrics—no new API calls.
          </div>
        </div>

        {/* Current Air Quality */}
        {airQualityData && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-3">Current Air Quality</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">PM2.5</p>
                <p className="text-lg font-bold">{airQualityData.pm2_5} µg/m³</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">PM10</p>
                <p className="text-lg font-bold">{airQualityData.pm10} µg/m³</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">Ozone</p>
                <p className="text-lg font-bold">{airQualityData.ozone} µg/m³</p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">NO₂</p>
                <p className="text-lg font-bold">{airQualityData.nitrogen_dioxide} µg/m³</p>
              </div>
            </div>

            <div className="mt-3 text-sm text-gray-700">
              <span className="font-semibold">AQI:</span> {currentAQI} ({getAQILabel(currentAQI)})
            </div>
          </div>
        )}

        {/* Weather Data */}
        {weatherData && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-3">Current Weather</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">Temperature</p>
                <p className="text-lg font-bold">{weatherData.temperature_2m}°C</p>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">Humidity</p>
                <p className="text-lg font-bold">{weatherData.relative_humidity_2m}%</p>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">Wind Speed</p>
                <p className="text-lg font-bold">{weatherData.wind_speed_10m} km/h</p>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500">UV Index</p>
                <p className="text-lg font-bold">{weatherData.uv_index}</p>
              </div>
            </div>
          </div>
        )}

        {/* Conversational AI Data Translator */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">🤖 AI Health Companion</h2>
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg">
            <p className="text-sm text-gray-700 leading-relaxed">
              {loading ? 'Analyzing environmental data...' : aiInsight || 'Search for a location to get an empathetic health summary!'}
            </p>
            <div className="text-[11px] text-gray-600 mt-2">
              {import.meta.env.VITE_LLM_API_KEY && import.meta.env.VITE_LLM_ENDPOINT
                ? 'Using LLM translator (if reachable); falls back gracefully.'
                : 'LLM translator not configured—using local empathetic summary.'}
            </div>
          </div>
        </div>

        <div className="text-xs text-gray-500">
          <p>📍 {locationName}</p>
          <p className="mt-1">Data from Open-Meteo APIs</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Map */}
        <div className="flex-1 relative">
          <MapContainer center={position} zoom={10} className="h-full w-full">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <MapController position={position} />

            {/* Neighborhood overlay markers */}
            {neighborhoodMarkers.map((m) => (
              <Marker
                key={m.id}
                position={[m.lat, m.lon]}
                icon={
                  L.divIcon({
                    className: 'aqi-marker',
                    html: `<div class="w-5 h-5 rounded-full border-2 border-white shadow" style="background-color: ${getAQIColor(m.aqi)}"></div>`,
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                  })
                }
              >
                <Popup>
                  <div className="text-center">
                    <strong>{m.name}</strong>
                    <br />
                    AQI: {m.aqi} ({getAQILabel(m.aqi)})
                  </div>
                </Popup>
              </Marker>
            ))}

            <Marker position={position} icon={currentMarkerIcon}>
              <Popup>
                <div className="text-center">
                  <strong>{locationName}</strong>
                  <br />
                  AQI: {currentAQI} ({getAQILabel(currentAQI)})
                </div>
              </Popup>
            </Marker>
          </MapContainer>

          {loading && (
            <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center z-[1000]">
              <div className="bg-white p-6 rounded-lg shadow-lg">
                <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-3"></div>
                <p className="text-gray-700">Loading environmental data...</p>
              </div>
            </div>
          )}
        </div>

        {/* Charts */}
        <div className="border-t bg-white">
          <div className="p-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Analytics Dashboard</h3>
              <p className="text-xs text-gray-600">Switch views for correlation vs. raw AQ trends.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCorrelationMode('sync')}
                className={
                  correlationMode === 'sync'
                    ? 'px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm'
                    : 'px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm hover:bg-gray-200'
                }
              >
                Sync Correlation
              </button>
              <button
                onClick={() => setCorrelationMode('aqi')}
                className={
                  correlationMode === 'aqi'
                    ? 'px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm'
                    : 'px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm hover:bg-gray-200'
                }
              >
                AQ Trend
              </button>
            </div>
          </div>

          {historicalData && (
            <div className="h-72 px-4 pb-4">
              {correlationMode === 'sync' ? (
                corrChartData && <Line options={correlationOptions} data={corrChartData} />
              ) : (
                chartDataAQ && <Line options={chartOptionsAQ} data={chartDataAQ} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

