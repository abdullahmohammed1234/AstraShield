# AstraShield — Intelligent Orbital Risk & Debris Visualization Platform

A production-ready web application that visualizes real satellite and debris orbits in 3D, calculates congestion and collision risk scores, predicts reentry events, and simulates safer orbital adjustments using advanced ML models.

## 🌟 Features

- **3D Orbital Visualization**: Interactive 3D globe with real-time satellite positions using React Three Fiber
- **Risk Analysis**: Advanced collision risk scoring using TLE data
- **ML-Powered Predictions**: Machine learning models for collision probability and risk prediction
- **Conjunction Monitoring**: Track and analyze potential conjunction events between objects
- **Reentry Tracking**: Monitor and predict satellite/object reentry events
- **Launch Window Analysis**: Analyze optimal launch windows considering orbital debris
- **Real-time Alerts**: WebSocket-based real-time alerts for high-risk events
- **Orbital Simulation**: Simulate altitude and inclination adjustments
- **Analytics Dashboard**: Comprehensive charts and statistics
- **Webhook Integration**: Configure webhooks for external alert notifications
- **Admin Panel**: Manage satellites, alerts, and system configuration
- **Real Data**: Uses actual TLE data from CelesTrak via satellite.js

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Redis (for caching and session management)
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
   REDIS_URL=redis://localhost:6379
   CELESTRAK_URL=https://celestrak.org/NORAD/elements/gp.php
   ```

5. **Start MongoDB and Redis**
   ```bash
   mongod
   redis-server
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
- React Three Fiber + Three.js (3D visualization)
- TailwindCSS
- Recharts
- React Router DOM
- WebSocket API (real-time updates)

### Backend
- Node.js + Express
- MongoDB + Mongoose
- Redis (caching & queue)
- satellite.js
- node-cron
- ML libraries

### Infrastructure
- Docker & Docker Compose
- Kubernetes (K8s) manifests
- Nginx reverse proxy

## 📁 Project Structure

```
astrashield/
├── client/                      # React frontend (Vite)
│   ├── src/
│   │   ├── components/          # UI components
│   │   │   ├── Dashboard/       # Dashboard-specific components
│   │   │   ├── Globe/           # 3D globe components
│   │   │   └── ui/              # Reusable UI components
│   │   ├── pages/               # Page components
│   │   │   ├── Admin.jsx
│   │   │   ├── Alerts.jsx
│   │   │   ├── Analytics.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Explorer.jsx
│   │   │   ├── MLPrediction.jsx
│   │   │   ├── Reentry.jsx
│   │   │   └── Simulation.jsx
│   │   ├── hooks/               # Custom React hooks
│   │   ├── services/            # API services
│   │   ├── theme/               # Theme configuration
│   │   └── utils/               # Utility functions
│   └── package.json
├── server/                      # Node.js backend
│   ├── config/                  # Database & Redis config
│   ├── controllers/             # Route controllers
│   ├── middleware/              # Express middleware
│   │   ├── errorHandler.js
│   │   ├── performance.js
│   │   ├── requestDeduplication.js
│   │   └── circuitBreaker.js
│   ├── models/                  # Mongoose models
│   │   ├── Alert.js
│   │   ├── Conjunction.js
│   │   ├── MLPrediction.js
│   │   ├── RiskSnapshot.js
│   │   ├── Satellite.js
│   │   └── WebhookConfig.js
│   ├── routes/                  # API routes
│   ├── services/                # Business logic
│   │   ├── ml/                  # ML prediction services
│   │   ├── collisionProbabilityEngine.js
│   │   ├── conjunctionEngine.js
│   │   ├── launchWindowAnalyzer.js
│   │   ├── reentryEngine.js
│   │   ├── riskEngine.js
│   │   ├── webhookService.js
│   │   └── queue.js
│   └── server.js                # Entry point
├── k8s/                         # Kubernetes manifests
│   └── base/
├── docker-compose.yml
├── Dockerfile.server
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

### Conjunctions
- `GET /api/conjunctions` - Get conjunction events
- `GET /api/conjunctions/:id` - Get conjunction details

### Reentry
- `GET /api/reentry` - Get reentry predictions
- `GET /api/reentry/:id` - Get reentry event details

### Alerts
- `GET /api/alerts` - Get all alerts
- `POST /api/alerts` - Create alert
- `PUT /api/alerts/:id` - Update alert
- `DELETE /api/alerts/:id` - Delete alert

### ML Predictions
- `GET /api/ml-predictions` - Get ML predictions
- `POST /api/ml-predictions` - Create new prediction
- `GET /api/ml-predictions/:id` - Get prediction details

### Webhooks
- `GET /api/webhooks` - Get webhook configurations
- `POST /api/webhooks` - Create webhook
- `DELETE /api/webhooks/:id` - Delete webhook

### Reports
- `GET /api/reports` - Generate reports
- `POST /api/reports` - Create report

### Launch Windows
- `GET /api/launch-windows` - Get launch window analysis
- `POST /api/launch-windows/analyze` - Analyze launch window

## 🎨 UI Theme

The application uses a premium "space-grade" aesthetic:
- **Deep Space**: `#0B0F1A`
- **Neon Cyan**: `#22D3EE`
- **Solar Amber**: `#F59E0B`
- **Alert Red**: `#EF4444`

## 📊 Core Engines

### Collision Probability Engine
Calculates collision probability between orbital objects using miss distance, relative velocity, and object sizes.

### Conjunction Engine
Identifies and tracks potential conjunction events, filtering by miss distance thresholds.

### Reentry Engine
Predicts reentry trajectories and provides impact location estimates.

### Risk Engine
Computes overall orbital risk scores based on:
- Object count in orbital shell
- Collision probability
- Object velocity and size

### ML Risk Predictor
Machine learning model trained on historical conjunction data to predict future collision risks.

## 🔄 Data Flow

1. **Data Ingestion**: CelesTrak → TLE Fetcher → Backend → MongoDB
2. **Risk Processing**: MongoDB → Risk Engine → Risk Snapshots
3. **ML Predictions**: Historical Data → ML Models → Risk Predictions
4. **Alert System**: Risk Events → Alert Service → WebSocket / Webhooks
5. **Frontend Display**: API → React → 3D Globe / Charts

## 🔧 Advanced Features

### Resilience
- **Circuit Breaker**: Prevents cascading failures when external services are down
- **Retry Logic**: Automatic retry with exponential backoff for failed operations
- **Request Deduplication**: Prevents duplicate requests for the same resource

### Performance
- **Redis Caching**: Caches frequently accessed data
- **Worker Processes**: Background job processing for heavy computations

##  License

MIT
