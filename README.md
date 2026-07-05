# GeoSustain: Interactive Disaster & Resource Tracker

A public-facing web application that tracks and visualizes real-time localized environmental metrics to help citizens and researchers understand environmental health.

## 🌍 Project Overview

GeoSustain integrates public APIs to map real-time Air Quality Index (AQI), local weather disruptions, and regional climate trends onto an interactive map. Users can search for any city or region to get an instant "Sustainability & Climate Health Score."

### Key Features

- **Interactive Heatmap**: Map centered on your location with color-coded AQI markers
- **Visual Trend Analytics**: 7-day air quality trend charts using Chart.js
- **AI Smart Interpretation**: Human-friendly health insights based on environmental data
- **Climate Health Score**: Real-time consolidated score out of 100
- **Cross-Data Correlation**: Weather and air quality data overlaid on a single timeline

## 🛠️ Tech Stack

- **Frontend**: React + Vite + TailwindCSS
- **Mapping**: Leaflet.js + OpenStreetMap
- **Charts**: Chart.js + React-ChartJS-2
- **APIs**: 
  - Open-Meteo Air Quality API (PM2.5, PM10, Ozone)
  - Open-Meteo Weather API (Temperature, Humidity, Wind, UV Index)
  - Nominatim (Location Search)

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/novicecode050/BeingInfinity_AutoSuggest_Hackathon.git
cd BeingInfinity_AutoSuggest_Hackathon

# Install dependencies
npm install

# Start development server
npm run dev
```

### Environment Variables

Create a `.env` file in the project root (optional for the AI Health Companion):

```env
# OpenAI-compatible Chat Completions (used by the app)
# Provide an OpenAI-compatible endpoint URL.
# Example endpoint:
#   https://api.openai.com/v1/chat/completions
VITE_LLM_ENDPOINT=your_openai_compatible_chat_endpoint

# API key used as Bearer token.
VITE_LLM_API_KEY=your_key_here
```

> Note: If `VITE_LLM_API_KEY` or `VITE_LLM_ENDPOINT` is missing, GeoSustain automatically falls back to the built-in rule-based insights. Open-Meteo + Nominatim work without keys.


## 📊 End Users

### 1. Daily Citizens & Health-Conscious Individuals
- Check localized AQI before outdoor activities
- Make informed health decisions
- Get real-time environmental alerts

### 2. Environmental Students & Researchers
- Study environmental trends
- Analyze historical climate data
- Use pre-built visualizations for case studies

### 3. Local Smart-City Communities & Volunteers
- Identify heavily affected zones
- Support awareness campaigns with data
- Pinpoint micro-regions with pollution issues

## 🎯 How It Helps

1. **Simplifies Complex Environmental Data**: Translates raw metrics into color-coded visual dashboard
2. **Eliminates Data Silos**: Unified hub for weather, air quality, and climate trends
3. **Visual Evidence for Research**: Interactive charts for academic reports
4. **Data-Driven Community Action**: Live map visualizations for campaigns

## 🏗️ Project Structure

```
├── public/
│   └── leaf.svg           # Favicon
├── src/
│   ├── App.jsx            # Main application component
│   ├── main.jsx           # Entry point
│   └── index.css          # Tailwind CSS + custom styles
├── index.html             # HTML template
├── vite.config.js         # Vite configuration
├── tailwind.config.js     # Tailwind CSS configuration
├── postcss.config.js      # PostCSS configuration
├── package.json           # Dependencies and scripts
└── .env.example           # Environment variables template
```

## 📱 Features in Detail

### Interactive Map
- Click-to-search for any location
- Color-coded markers based on AQI levels
- Real-time data visualization

### Climate Health Score
- Dynamic score from 0-100
- Based on AQI, UV index, and temperature
- Visual gauge indicator

### 7-Day Trends
- PM2.5 and PM10 historical data
- Interactive line charts
- Easy-to-read trend visualization

### AI Health Companion
- Personalized health insights
- Actionable recommendations
- Real-time data interpretation

## 🌐 API Integration

### Open-Meteo Air Quality
```
https://air-quality-api.open-meteo.com/v1/air-quality
```

### Open-Meteo Weather
```
https://api.open-meteo.com/v1/forecast
```

### Nominatim Location Search
```
https://nominatim.openstreetmap.org/search
```

## 📦 Build for Production

```bash
npm run build
```

## 🚀 Deployment

The app can be deployed to:
- Vercel
- Netlify
- GitHub Pages

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License

---

**GeoSustain** - Making environmental data accessible and actionable for everyone!