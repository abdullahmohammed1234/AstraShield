import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Explorer from './pages/Explorer';
import Simulation from './pages/Simulation';
import Analytics from './pages/Analytics';
import Admin from './pages/Admin';
import Alerts from './pages/Alerts';
import Reentry from './pages/Reentry';
import MLPrediction from './pages/MLPrediction';
import DebrisAnalytics from './pages/DebrisAnalytics';
import BreakupSimulator from './pages/BreakupSimulator';
import KesslerPrediction from './pages/KesslerPrediction';
import MissionPlanning from './pages/MissionPlanning';
import Lifetime from './pages/Lifetime';
import ClosestApproach from './pages/ClosestApproach';
import RiskThresholds from './pages/RiskThresholds';
import TopBar from './components/TopBar';
import Footer from './components/Footer';
import { ToastProvider } from './components/ui/Toast';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

function App() {
  return (
    <ToastProvider>
      <ErrorBoundary>
        <Router>
          <div className="min-h-screen bg-space-dark">
            <TopBar />
            <main className="pt-16 min-h-[calc(100vh-4rem)]">
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/explorer" element={<Explorer />} />
                <Route path="/simulation" element={<Simulation />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/alerts" element={<Alerts />} />
                <Route path="/reentry" element={<Reentry />} />
                <Route path="/ml-prediction" element={<MLPrediction />} />
                <Route path="/debris-analytics" element={<DebrisAnalytics />} />
                <Route path="/breakup-simulator" element={<BreakupSimulator />} />
                <Route path="/kessler-prediction" element={<KesslerPrediction />} />
                <Route path="/mission-planning" element={<MissionPlanning />} />
                <Route path="/lifetime" element={<Lifetime />} />
                <Route path="/closest-approach" element={<ClosestApproach />} />
                <Route path="/risk-thresholds" element={<RiskThresholds />} />
              </Routes>
            </main>
            <Footer />
          </div>
        </Router>
      </ErrorBoundary>
    </ToastProvider>
  );
}

export default App;
