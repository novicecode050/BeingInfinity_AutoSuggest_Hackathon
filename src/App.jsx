import React, { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import { Line } from 'react-chartjs-2'
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
} from 'chart.js'
import axios from 'axios'
import L from 'leaflet'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

// AQI color function
const getAQIColor = (aqi) => {
  if (aqi <= 50) return '#00E400' // Good
  if (aqi <= 100) return '#FFFF00' // Moderate
  if (aqi <= 150) return '#FF7E00' // Sensitive
  if (aqi <= 200) return '#FF0000' // Unhealthy
  if (aqi <= 300) return '#8F3F97' // Very Unhealthy
  return '#7E0023' // Hazardous
}

const getAQILabel = (aqi) => {
  if (aqi <= 50) return 'Good'
  if (aqi <= 100) return 'Moderate'
  if (aqi <= 150) return 'Sensitive'
  if (aqi <= 200) return 'Unhealthy'
  if (aqi <= 300) return 'Very Unhealthy'
  return 'Hazardous'
}

// Map component that updates when location changes
function MapController({ position }) {
  const map = useMap()
  useEffect(() => {
    if (position) {
      map.setView(position, 10)
    }
  }, [position, map])
  return null
}

function App() {
  const [searchQuery, setSearchQuery] = useState('')
  const [position, setPosition] = useState([20.5937, 78.9629]) // Default: India center
  const [locationName, setLocationName] = useState('India')
  const [airQualityData, setAirQualityData] = useState(null)
  const [weatherData, setWeatherData] = useState(null)
  const [historicalData, setHistoricalData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [aiInsight, setAiInsight] = useState('')
  const [climateScore, setClimateScore] = useState(0)

  // Get user's current location on load
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPosition([pos.coords.latitude, pos.coords.longitude])
        },
        (err) => console.log('Geolocation error:', err)
      )
    }
  }, [])

  // Fetch data when position changes
  useEffect(() => {
    if (position) {
      fetchData(position[0], position[1])
    }
  }, [position])

  // Fetch air quality and weather data
  const fetchData = async (lat, lon) => {
    setLoading(true)
    try {
      // Open-Meteo Air Quality API
      const airQualityResponse = await axios.get(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone&timezone=auto`
      )
      
      // Open-Meteo Weather API
      const weatherResponse = await axios.get(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,uv_index&timezone=auto`
      )

      // Historical data for 7-day trends
      const historicalResponse = await axios.get(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&start_date=${getDateDaysAgo(7)}&end_date=${getTodayDate()}&daily=pm2_5,pm10,ozone,temperature_2m_max&timezone=auto`
      )

      setAirQualityData(airQualityResponse.data.current)
      setWeatherData(weatherResponse.data.current)
      setHistoricalData(historicalResponse.data.daily)
      
      // Calculate climate health score
      const aqi = calculateAQI(airQualityResponse.data.current)
      setClimateScore(calculateClimateScore(aqi, weatherResponse.data.current))
      
      // Generate AI insight
      generateAIInsight(airQualityResponse.data.current, weatherResponse.data.current, aqi)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getDateDaysAgo = (days) => {
    const date = new Date()
    date.setDate(date.getDate() - days)
    return date.toISOString().split('T')[0]
  }

  const getTodayDate = () => {
    return new Date().toISOString().split('T')[0]
  }

  // Simplified AQI calculation based on PM2.5
  const calculateAQI = (data) => {
    const pm25 = data.pm2_5 || 0
    if (pm25 <= 12) return Math.round((pm25 / 12) * 50)
    if (pm25 <= 35.4) return Math.round(((pm25 - 12) / (35.4 - 12)) * 50 + 50)
    if (pm25 <= 55.4) return Math.round(((pm25 - 35.4) / (55.4 - 35.4)) * 50 + 100)
    if (pm25 <= 150.4) return Math.round(((pm25 - 55.4) / (150.4 - 55.4)) * 50 + 150)
    if (pm25 <= 250.4) return Math.round(((pm25 - 150.4) / (250.4 - 150.4)) * 50 + 200)
    if (pm25 <= 350.4) return Math.round(((pm25 - 250.4) / (350.4 - 250.4)) * 50 + 300)
    return 400
  }

  const calculateClimateScore = (aqi, weather) => {
    let score = 100
    if (aqi > 100) score -= (aqi - 100) * 0.5
    if (weather?.uv_index > 5) score -= (weather.uv_index - 5) * 2
    if (weather?.temperature_2m > 35) score -= (weather.temperature_2m - 35) * 1
    return Math.max(0, Math.min(100, Math.round(score)))
  }

  const generateAIInsight = (airData, weatherData, aqi) => {
    const label = getAQILabel(aqi)
    const insights = []
    
    if (aqi <= 50) {
      insights.push(`🌱 Great news! The air quality in your area is excellent (AQI: ${aqi}). It's a perfect day for outdoor activities.`)
    } else if (aqi <= 100) {
      insights.push(`😊 The air quality is moderate (AQI: ${aqi}). Generally safe, but sensitive individuals should monitor symptoms.`)
    } else if (aqi <= 150) {
      insights.push(`⚠️ Air quality is unhealthy for sensitive groups (AQI: ${aqi}). Consider limiting prolonged outdoor exertion.`)
    } else if (aqi <= 200) {
      insights.push(`🚨 The AQI is ${aqi} (${label}). It is advised to avoid outdoor cardio today and wear a mask if going outside.`)
    } else {
      insights.push(`☠️ Warning! Air quality is ${label.toLowerCase()} (AQI: ${aqi}). Stay indoors and keep windows closed.`)
    }

    if (weatherData?.uv_index > 7) {
      insights.push(`☀️ UV index is high (${weatherData.uv_index}). Remember to use sunscreen and protective clothing.`)
    }

    if (weatherData?.temperature_2m > 30) {
      insights.push(`🌡️ Temperature is ${weatherData.temperature_2m}°C. Stay hydrated and avoid peak sun hours.`)
    }

    setAiInsight(insights.join(' '))
  }

  // Search for location
  const searchLocation = async () => {
    if (!searchQuery) return
    try {
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`
      )
      if (response.data && response.data.length > 0) {
        const { lat, lon, display_name } = response.data[0]
        setPosition([parseFloat(lat), parseFloat(lon)])
        setLocationName(display_name)
        fetchData(parseFloat(lat), parseFloat(lon))
      }
    } catch (error) {
      console.error('Error searching location:', error)
    }
  }

  // Handle Enter key
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      searchLocation()
    }
  }

  // Chart data for 7-day trends
  const chartData = {
    labels: historicalData?.time?.map(date => new Date(date).toLocaleDateString('en', { month: 'short', day: 'numeric' })) || [],
    datasets: [
      {
        label: 'PM2.5 (µg/m³)',
        data: historicalData?.pm2_5 || [],
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
        fill: true
      },
      {
        label: 'PM10 (µg/m³)',
        data: historicalData?.pm10 || [],
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.4,
        fill: true
      }
    ]
  }

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: '7-Day Air Quality Trends'
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Concentration (µg/m³)'
        }
      }
    }
  }

  // Get current AQI for marker
  const currentAQI = airQualityData ? calculateAQI(airQualityData) : 0

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Sidebar */}
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

        {/* Climate Health Score */}
        <div className="mb-6 bg-gradient-to-r from-blue-50 to-green-50 rounded-xl p-4">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Climate Health Score</h2>
          <div className="relative w-full h-32">
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
                stroke={climateScore >= 70 ? '#10B981' : climateScore >= 40 ? '#F59E0B' : '#EF4444'}
                strokeWidth="8"
                strokeDasharray="188"
                strokeDashoffset={188 - (188 * climateScore) / 100}
                className="transition-all duration-1000"
              />
              <text x="50" y="30" textAnchor="middle" className="text-2xl font-bold fill-gray-800">{climateScore}</text>
              <text x="50" y="45" textAnchor="middle" className="text-sm fill-gray-600">/100</text>
            </svg>
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

        {/* AI Health Companion */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">🤖 AI Health Companion</h2>
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg">
            <p className="text-sm text-gray-700 leading-relaxed">
              {loading ? 'Analyzing environmental data...' : aiInsight || 'Search for a location to get personalized insights!'}
            </p>
          </div>
        </div>

        {/* Location Info */}
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
            <Marker position={position} 
              icon={L.divIcon({
                className: 'aqi-marker',
                html: `<div class="w-8 h-8 rounded-full border-2 border-white shadow-lg" style="background-color: ${getAQIColor(currentAQI)}"></div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 32]
              })}
            >
              <Popup>
                <div className="text-center">
                  <strong>{locationName}</strong>
                  <br />
                  AQI: {currentAQI} ({getAQILabel(currentAQI)})
                </div>
              </Popup>
            </Marker>
          </MapContainer>
          
          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center z-[1000]">
              <div className="bg-white p-6 rounded-lg shadow-lg">
                <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-3"></div>
                <p className="text-gray-700">Loading environmental data...</p>
              </div>
            </div>
          )}
        </div>

        {/* Chart */}
        {historicalData && (
          <div className="h-64 bg-white p-4 border-t">
            <Line options={chartOptions} data={chartData} />
          </div>
        )}
      </div>
    </div>
  )
}

export default App