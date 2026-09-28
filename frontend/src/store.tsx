import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './lib/api';
import { useAsync, useLocalStorage } from './lib/hooks';
import type { WellSummary } from './lib/types';

export type Theme = 'dark' | 'light';

export interface Toast {
  id: number;
  tone: 'info' | 'warn' | 'danger' | 'success';
  title: string;
  detail?: string;
}

interface AppStateValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;

  /** The well every screen is currently centred on. */
  focusWellId: string | null;
  setFocusWellId: (id: string) => void;
  focusWell: WellSummary | null;

  /** Shared well catalogue so every picker/filter agrees without refetching. */
  wells: WellSummary[];
  wellsLoading: boolean;
  wellsError: string | null;
  refreshWells: () => void;

  alertCounts: { critical: number; high: number; medium: number };
  setAlertCounts: (counts: { critical: number; high: number; medium: number }) => void;

  toasts: Toast[];
  pushToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
}

const AppContext = createContext<AppStateValue | null>(null);

let toastSeq = 0;

export function AppProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useLocalStorage<Theme>('drillmind.theme', 'dark');
  const [focusWellId, setFocusWellIdRaw] = useLocalStorage<string | null>('drillmind.focusWell', null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [alertCounts, setAlertCounts] = useState({ critical: 0, high: 0, medium: 0 });

  const { data: wellPayload, loading: wellsLoading, error: wellsError, reload: refreshWells } = useAsync(
    (signal) => api.wells({ limit: 500, sort: 'risk' }, signal),
    [],
  );

  const wells = useMemo(() => wellPayload?.wells ?? [], [wellPayload]);

  // Pick a sensible default focus well once the catalogue arrives.
  useEffect(() => {
    if (focusWellId && wells.some((well) => well.id === focusWellId)) return;
    if (wells.length === 0) return;
    const preferred = wells.find((well) => well.status === 'ACTIVE') ?? wells[0];
    setFocusWellIdRaw(preferred.id);
  }, [wells, focusWellId, setFocusWellIdRaw]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const setFocusWellId = useCallback((id: string) => setFocusWellIdRaw(id), [setFocusWellIdRaw]);
  const toggleTheme = useCallback(
    () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark')),
    [setTheme],
  );

  const pushToast = useCallback((toast: Omit<Toast, 'id'>) => {
    toastSeq += 1;
    const id = toastSeq;
    setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 5200);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const focusWell = useMemo(
    () => wells.find((well) => well.id === focusWellId) ?? null,
    [wells, focusWellId],
  );

  const value = useMemo<AppStateValue>(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      focusWellId,
      setFocusWellId,
      focusWell,
      wells,
      wellsLoading,
      wellsError,
      refreshWells,
      alertCounts,
      setAlertCounts,
      toasts,
      pushToast,
      dismissToast,
    }),
    [
      theme,
      setTheme,
      toggleTheme,
      focusWellId,
      setFocusWellId,
      focusWell,
      wells,
      wellsLoading,
      wellsError,
      refreshWells,
      alertCounts,
      toasts,
      pushToast,
      dismissToast,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppStateValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppProvider>');
  return value;
}
