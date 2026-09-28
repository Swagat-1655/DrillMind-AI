import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell, FieldTicker } from './components/layout';
import { Toasts } from './components/ui';
import { api } from './lib/api';
import { useI18n } from './i18n';
import { useApp } from './store';

import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import WellsMap from './pages/WellsMap';
import FormationTimeMachine from './pages/FormationTimeMachine';
import RiskIntelligence from './pages/RiskIntelligence';
import SimilarityEngine from './pages/SimilarityEngine';
import DigitalTwinPage from './pages/DigitalTwinPage';
import KnowledgeGraphPage from './pages/KnowledgeGraphPage';
import MemoryScore from './pages/MemoryScore';
import Copilot from './pages/Copilot';
import IncidentReplay from './pages/IncidentReplay';
import WhatIfLab from './pages/WhatIfLab';
import AlertsPage from './pages/AlertsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import ReportsPage from './pages/ReportsPage';
import DatasetsPage from './pages/DatasetsPage';

/** Keeps the navbar alert badge in sync with the live alert engine. */
function AlertSync() {
  const { setAlertCounts } = useApp();
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api
        .alerts({ limit: 1 })
        .then((payload) => {
          if (cancelled) return;
          setAlertCounts({
            critical: payload.counts.CRITICAL ?? 0,
            high: payload.counts.HIGH ?? 0,
            medium: payload.counts.MEDIUM ?? 0,
          });
        })
        .catch(() => undefined);
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [setAlertCounts]);
  return null;
}

function Shell() {
  const { pathname } = useLocation();
  const { wells } = useApp();
  const { t } = useI18n();
  const flush = pathname === '/';

  // Scroll to the top on navigation, as a mission console should.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

  useEffect(() => {
    document.title = `${t('app.name')} · ${t('app.tagline')}`;
  }, [t]);

  return (
    <AppShell flush={flush}>
      <Outlet />
      {pathname === '/dashboard' && <FieldTicker wells={wells.slice(0, 18)} />}
    </AppShell>
  );
}

export default function App() {
  return (
    <>
      <AlertSync />
      <Routes>
        <Route element={<Shell />}>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/map" element={<WellsMap />} />
          <Route path="/formation" element={<FormationTimeMachine />} />
          <Route path="/risk" element={<RiskIntelligence />} />
          <Route path="/similarity" element={<SimilarityEngine />} />
          <Route path="/twin" element={<DigitalTwinPage />} />
          <Route path="/knowledge" element={<KnowledgeGraphPage />} />
          <Route path="/memory" element={<MemoryScore />} />
          <Route path="/copilot" element={<Copilot />} />
          <Route path="/replay" element={<IncidentReplay />} />
          <Route path="/whatif" element={<WhatIfLab />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/datasets" element={<DatasetsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toasts />
    </>
  );
}
