# AstraShield — Intelligent Orbital Risk & Debris Visualization Platform

A production-ready hackathon MVP web application that visualizes real satellite and debris orbits in 3D, calculates congestion and collision risk scores, and simulates safer orbital adjustments.

## 🌟 Features

- **3D Orbital Visualization**: Interactive 3D globe with real-time satellite positions
- **Risk Analysis**: Advanced collision risk scoring using TLE data
- **Orbital Simulation**: Simulate altitude and inclination adjustments
- **Analytics Dashboard**: Comprehensive charts and statistics
- **Real Data**: Uses actual TLE data from CelesTrak via satellite.js

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   cd astrashield
   ```

2. **Install server dependencies**
   ```bash
   cd server
   npm install
   ```

3. **Install client dependencies**
   ```bash
   cd ../client
   npm install
   ```

4. **Configure environment**
   
   Create `.env` in server directory:
   ```env
   PORT=5000
   MONGODB_URI=mongodb://localhost:27017/astrashield
   ```

5. **Start MongoDB**
   ```bash
   mongod
   ```

6. **Start the server**
   ```bash
   cd server
   npm run dev
   ```

7. **Start the client** (in a new terminal)
   ```bash
   cd client
   npm run dev
   ```

8. **Seed the database**
   
   Visit `http://localhost:5000/api/seed` to fetch TLE data

## 🛠 Tech Stack

### Frontend
- React 18 + Vite
- React Three Fiber + Three.js
- TailwindCSS
- Recharts
- React Router DOM

### Backend
- Node.js + Express
- MongoDB + Mongoose
- satellite.js
- node-cron

## 📁 Project Structure

```
astrashield/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API services
│   │   └── theme/         # Theme configuration
│   └── package.json
├── server/                 # Node.js backend
│   ├── config/            # Database config
│   ├── controllers/       # Route controllers
│   ├── models/            # Mongoose models
│   ├── routes/            # API routes
│   ├── services/          # Business logic
│   └── server.js          # Entry point
└── README.md
```

## 🔌 API Endpoints

### Satellites
- `GET /api/satellites` - Get all satellites
- `GET /api/satellites/positions` - Get satellite positions for 3D
- `GET /api/satellites/:id` - Get satellite details
- `GET /api/satellites/search?q=query` - Search satellites
- `POST /api/satellites/refresh` - Refresh TLE data

### Risk Analysis
- `GET /api/risk` - Get all risk scores
- `GET /api/risk/alerts` - Get high risk alerts
- `GET /api/risk/statistics` - Get risk statistics
- `GET /api/risk/congestion` - Get congestion data
- `POST /api/risk/simulate` - Run orbital adjustment simulation

## 🎨 UI Theme

The application uses a premium "space-grade" aesthetic:
- **Deep Space**: `#0B0F1A`
- **Neon Cyan**: `#22D3EE`
- **Solar Amber**: `#F59E0B`
- **Alert Red**: `#EF4444`

## 📊 Risk Scoring Formula

```
risk = (1 / closestDistanceKm) * velocityFactor * congestionFactor
```

## 🔄 Data Flow

1. CelesTrak → Backend Fetch → MongoDB
2. MongoDB → Risk Engine → API
3. API → Frontend → 3D Globe

## 📝 License

MIT
