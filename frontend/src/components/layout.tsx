import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Icon, type IconName } from './ui';
import { LANGUAGES, useI18n } from '../i18n';
import { cx, num, pct, STATUS_COLOR } from '../lib/format';
import { useClickOutside } from '../lib/hooks';
import type { Lang, WellSummary } from '../lib/types';
import { useApp } from '../store';

export interface NavItem {
  to: string;
  labelKey: string;
  icon: IconName;
  badge?: 'alerts';
}

export interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'nav.overview',
    items: [
      { to: '/', labelKey: 'nav.landing', icon: 'compass' },
      { to: '/dashboard', labelKey: 'nav.dashboard', icon: 'dashboard' },
      { to: '/map', labelKey: 'nav.map', icon: 'map' },
    ],
  },
  {
    labelKey: 'nav.intelligence',
    items: [
      { to: '/formation', labelKey: 'nav.formation', icon: 'formation' },
      { to: '/risk', labelKey: 'nav.risk', icon: 'risk' },
      { to: '/similarity', labelKey: 'nav.similarity', icon: 'similarity' },
      { to: '/twin', labelKey: 'nav.twin', icon: 'twin' },
      { to: '/knowledge', labelKey: 'nav.knowledge', icon: 'graph' },
      { to: '/memory', labelKey: 'nav.memory', icon: 'memory' },
    ],
  },
  {
    labelKey: 'nav.operations',
    items: [
      { to: '/copilot', labelKey: 'nav.copilot', icon: 'copilot' },
      { to: '/replay', labelKey: 'nav.replay', icon: 'replay' },
      { to: '/whatif', labelKey: 'nav.whatif', icon: 'whatif' },
      { to: '/alerts', labelKey: 'nav.alerts', icon: 'alerts', badge: 'alerts' },
      { to: '/analytics', labelKey: 'nav.analytics', icon: 'analytics' },
      { to: '/reports', labelKey: 'nav.reports', icon: 'reports' },
      { to: '/datasets', labelKey: 'nav.datasets', icon: 'database' },
    ],
  },
];

export const PAGE_META: Record<string, { titleKey: string; hintKey: string }> = {
  '/': { titleKey: 'nav.landing', hintKey: 'app.tagline' },
  '/dashboard': { titleKey: 'dashboard.title', hintKey: 'dashboard.subtitle' },
  '/map': { titleKey: 'map.title', hintKey: 'map.subtitle' },
  '/formation': { titleKey: 'formation.title', hintKey: 'formation.subtitle' },
  '/risk': { titleKey: 'risk.title', hintKey: 'risk.subtitle' },
  '/similarity': { titleKey: 'nav.similarity', hintKey: 'risk.subtitle' },
  '/twin': { titleKey: 'twin.title', hintKey: 'twin.subtitle' },
  '/knowledge': { titleKey: 'knowledge.title', hintKey: 'knowledge.subtitle' },
  '/memory': { titleKey: 'memory.title', hintKey: 'memory.subtitle' },
  '/copilot': { titleKey: 'copilot.title', hintKey: 'copilot.subtitle' },
  '/replay': { titleKey: 'replay.title', hintKey: 'replay.subtitle' },
  '/whatif': { titleKey: 'whatif.title', hintKey: 'whatif.subtitle' },
  '/alerts': { titleKey: 'alerts.title', hintKey: 'alerts.subtitle' },
  '/analytics': { titleKey: 'analytics.title', hintKey: 'analytics.subtitle' },
  '/reports': { titleKey: 'reports.title', hintKey: 'reports.subtitle' },
  '/datasets': { titleKey: 'datasets.title', hintKey: 'datasets.subtitle' },
};

/* --------------------------------------------------------------------------
 * Brand
 * ------------------------------------------------------------------------ */

export function Logo({ size = 34, compact = false }: { size?: number; compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="row row--tight" style={{ gap: 10, minWidth: 0 }}>
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" style={{ flex: 'none' }}>
        <defs>
          <linearGradient id="dm-logo-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <linearGradient id="dm-logo-b" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="11" fill="rgba(9,19,35,.9)" stroke="rgba(34,211,238,.34)" />
        <path d="M20 6 9 13v14l11 7 11-7V13z" fill="none" stroke="url(#dm-logo-a)" strokeWidth="1.5" opacity=".85" />
        <path d="M20 30V15" stroke="url(#dm-logo-a)" strokeWidth="2" strokeLinecap="round" />
        <path d="M20 30 11 33M20 30l9 3" stroke="url(#dm-logo-b)" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="20" cy="12.5" r="3.1" fill="url(#dm-logo-b)" />
      </svg>
      {!compact && (
        <div className="sidebar__brand-text" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontFamily: 'Poppins, sans-serif', fontWeight: 700, fontSize: 15.5, letterSpacing: '-0.02em' }}>
            {t('app.name')}
          </span>
          <span className="t-xs t-mute nowrap" style={{ lineHeight: 1.25 }}>
            {t('app.acronym')} · {t('app.tagline')}
          </span>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Shell
 * ------------------------------------------------------------------------ */

export function AppShell({ children, flush = false }: { children: ReactNode; flush?: boolean }) {
  const { t } = useI18n();
  const { alertCounts } = useApp();
  const location = useLocation();
  const meta = PAGE_META[location.pathname];
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const alertsBadge = alertCounts.critical + alertCounts.high;

  return (
    <div className="app-shell">
      <div className="bg-field">
        <span className="bg-orb bg-orb--cyan" />
        <span className="bg-orb bg-orb--orange" />
        <span className="bg-orb bg-orb--violet" />
      </div>

      <aside className={cx('sidebar no-print', mobileOpen && 'sidebar--open')}>
        <div className="sidebar__brand">
          <Logo />
        </div>

        <nav className="sidebar__nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.labelKey}>
              <div className="nav-group">{t(group.labelKey)}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => cx('nav-item', isActive && 'nav-item--active')}
                  title={t(item.labelKey)}
                >
                  <Icon name={item.icon} size={16} />
                  <span>{t(item.labelKey)}</span>
                  {item.badge === 'alerts' && alertsBadge > 0 && (
                    <span className="nav-item__badge">{alertsBadge}</span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar__foot">
          <SystemStatus />
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar no-print">
          <button
            type="button"
            className="btn btn--ghost btn--icon topbar__burger"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label="Toggle navigation"
            aria-expanded={mobileOpen}
          >
            <Icon name={mobileOpen ? 'close' : 'dashboard'} size={16} />
          </button>
          <div className="topbar__title">
            <h1 style={{ fontSize: 17.5 }}>{t(meta?.titleKey ?? 'app.name')}</h1>
            <span className="t-xs t-mute clamp-2" style={{ maxWidth: '62ch' }}>
              {t(meta?.hintKey ?? 'app.tagline')}
            </span>
          </div>

          <div className="topbar__actions">
            <WellPicker />
            <AlertsButton />
            <LangSwitch />
            <ThemeToggle />
            <ProfileMenu />
          </div>
        </header>

        <main className={cx('page', flush && 'page--flush')}>{children}</main>
      </div>
    </div>
  );
}

function SystemStatus() {
  const { wells } = useApp();
  const active = wells.filter((well) => well.status === 'ACTIVE').length;
  return (
    <div className="stack-list" style={{ gap: 7 }}>
      <div className="row row--tight" style={{ justifyContent: 'space-between' }}>
        <span className="t-xs t-mute">eRTMAC stream</span>
        <span className="row row--tight t-xs" style={{ gap: 6 }}>
          <span className="dot dot--pulse" style={{ background: '#22c55e', color: '#22c55e' }} />
          live
        </span>
      </div>
      <div className="row row--tight" style={{ justifyContent: 'space-between' }}>
        <span className="t-xs t-mute">Wells indexed</span>
        <span className="mono t-xs t-dim">{num(wells.length)}</span>
      </div>
      <div className="row row--tight" style={{ justifyContent: 'space-between' }}>
        <span className="t-xs t-mute">Drilling now</span>
        <span className="mono t-xs" style={{ color: '#22d3ee' }}>{active}</span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Well picker
 * ------------------------------------------------------------------------ */

function WellPicker() {
  const { t } = useI18n();
  const { wells, focusWellId, setFocusWellId, focusWell } = useApp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const base = needle
      ? wells.filter(
          (well) =>
            well.name.toLowerCase().includes(needle) ||
            well.id.toLowerCase().includes(needle) ||
            well.field.toLowerCase().includes(needle) ||
            well.formation.toLowerCase().includes(needle),
        )
      : wells;
    return base.slice(0, 60);
  }, [wells, query]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => setOpen((prev) => !prev)}
        style={{ gap: 8, maxWidth: 300 }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Icon name="target" size={14} style={{ color: 'var(--cyan)' }} />
        <span className="nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 190 }}>
          {focusWell ? focusWell.name : t('common.selectWell')}
        </span>
        <Icon name="chevronDown" size={13} />
      </button>

      {open && (
        <div
          className="map-panel"
          style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 372, zIndex: 120, padding: 12 }}
          role="listbox"
        >
          <input
            className="input"
            placeholder={`${t('common.search')} — well, field, formation…`}
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="stack-list scroll-y" style={{ maxHeight: 330, marginTop: 10, gap: 3 }}>
            {filtered.length === 0 && <div className="empty" style={{ padding: '18px 0' }}>No wells match</div>}
            {filtered.map((well: WellSummary) => (
              <button
                key={well.id}
                type="button"
                role="option"
                aria-selected={well.id === focusWellId}
                onClick={() => {
                  setFocusWellId(well.id);
                  setOpen(false);
                }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '10px minmax(0,1fr) auto',
                  gap: 9,
                  alignItems: 'center',
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 10,
                  border: `1px solid ${well.id === focusWellId ? 'var(--border-glow)' : 'transparent'}`,
                  background: well.id === focusWellId ? 'rgba(34,211,238,.1)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span className="dot" style={{ background: STATUS_COLOR[well.status], color: STATUS_COLOR[well.status] }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.6, fontWeight: 600 }} className="nowrap">
                    {well.name}
                  </span>
                  <span className="t-xs t-mute nowrap" style={{ display: 'block' }}>
                    {well.field} · {well.formation} · {well.status}
                  </span>
                </span>
                <span className="mono t-xs" style={{ color: STATUS_COLOR[well.status] }}>
                  {well.riskScore.toFixed(0)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Controls
 * ------------------------------------------------------------------------ */

function AlertsButton() {
  const { alertCounts } = useApp();
  const total = alertCounts.critical + alertCounts.high + alertCounts.medium;
  return (
    <NavLink to="/alerts" className="btn btn--ghost btn--icon" title="Alert center" style={{ position: 'relative' }}>
      <Icon name="alerts" size={15} />
      {total > 0 && (
        <span
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: 16,
            height: 16,
            padding: '0 4px',
            borderRadius: 999,
            background: alertCounts.critical > 0 ? '#ef4444' : '#f97316',
            color: '#fff',
            fontSize: 9.5,
            fontWeight: 700,
            display: 'grid',
            placeItems: 'center',
            boxShadow: '0 0 10px rgba(239,68,68,.6)',
          }}
        >
          {total}
        </span>
      )}
    </NavLink>
  );
}

function LangSwitch() {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const current = LANGUAGES.find((item) => item.code === lang) ?? LANGUAGES[0];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="btn btn--ghost" onClick={() => setOpen((prev) => !prev)} title="Language">
        <span style={{ fontSize: 14 }}>{current.flag}</span>
        <span className="nowrap">{current.code.toUpperCase()}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {open && (
        <div className="map-panel" style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 190, zIndex: 120 }}>
          {LANGUAGES.map((option) => (
            <button
              key={option.code}
              type="button"
              onClick={() => {
                setLang(option.code as Lang);
                setOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                width: '100%',
                padding: '8px 10px',
                borderRadius: 9,
                border: 0,
                background: option.code === lang ? 'rgba(34,211,238,.12)' : 'transparent',
                color: 'inherit',
                cursor: 'pointer',
                fontSize: 12.8,
              }}
            >
              <span>{option.flag}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>{option.native}</span>
              {option.code === lang && <Icon name="check" size={13} style={{ color: 'var(--cyan)' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useApp();
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="btn btn--ghost btn--icon"
      onClick={toggleTheme}
      title={theme === 'dark' ? t('common.lightMode') : t('common.darkMode')}
      aria-label="Toggle theme"
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
    </button>
  );
}

function ProfileMenu() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn--ghost btn--icon"
        onClick={() => setOpen((prev) => !prev)}
        title={t('common.profile')}
        style={{
          width: 34,
          height: 34,
          borderRadius: 11,
          background: 'linear-gradient(140deg,#0e7490,#2563eb)',
          border: 0,
          color: '#fff',
          fontWeight: 700,
          fontSize: 12.5,
        }}
      >
        DE
      </button>
      {open && (
        <div className="map-panel" style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 258, zIndex: 120 }}>
          <div className="row" style={{ gap: 11 }}>
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                display: 'grid',
                placeItems: 'center',
                background: 'linear-gradient(140deg,#0e7490,#2563eb)',
                color: '#fff',
                fontWeight: 700,
              }}
            >
              DE
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 640, fontSize: 13 }}>Drilling Engineer</div>
              <div className="t-xs t-mute">Well Operations · Assam Asset</div>
            </div>
          </div>
          <div className="divider" style={{ margin: '11px 0' }} />
          <div className="t-xs t-mute" style={{ lineHeight: 1.7 }}>
            <div className="row row--tight" style={{ justifyContent: 'space-between' }}>
              <span>Role</span>
              <span className="mono t-dim">Well Engineer</span>
            </div>
            <div className="row row--tight" style={{ justifyContent: 'space-between' }}>
              <span>Asset</span>
              <span className="mono t-dim">Assam-Arakan</span>
            </div>
            <div className="row row--tight" style={{ justifyContent: 'space-between' }}>
              <span>Access</span>
              <span className="mono" style={{ color: '#22c55e' }}>NWIS · Read/Write</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
 * Field feed ticker
 * ------------------------------------------------------------------------ */

export function FieldTicker({ wells }: { wells: WellSummary[] }) {
  const items = wells.slice(0, 16);
  if (items.length === 0) return null;
  const doubled = [...items, ...items];
  return (
    <div className="ticker no-print">
      <div className="ticker__track">
        {doubled.map((well, index) => (
          <span key={`${well.id}-${index}`} className="ticker__item">
            <span className="dot" style={{ background: STATUS_COLOR[well.status], color: STATUS_COLOR[well.status] }} />
            <strong className="mono" style={{ color: 'var(--text)' }}>{well.name}</strong>
            <span className="t-mute">{well.field}</span>
            <span className="t-dim">{well.formation}</span>
            <span className="t-mute">MD</span>
            <span className="mono">{num(well.currentDepthMd)} m</span>
            <span className="t-mute">risk</span>
            <span className="mono" style={{ color: STATUS_COLOR[well.status] }}>
              {pct(well.riskScore)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
