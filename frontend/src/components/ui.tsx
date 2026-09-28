import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { bandChipClass, cx, outcomeChipClass, severityChipClass, statusChipClass } from '../lib/format';
import type { RiskBand, Severity, WellStatus } from '../lib/types';
import { useApp } from '../store';

/* --------------------------------------------------------------------------
 * Icons — a single stroked 24x24 set keeps the bundle free of an icon library.
 * ------------------------------------------------------------------------ */

const ICONS = {
  dashboard: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 8h8V3h-8z',
  map: 'M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6zM9 3v15M15 6v15',
  formation: 'M12 2 2 7l10 5 10-5zM2 12l10 5 10-5M2 17l10 5 10-5',
  copilot: 'M12 3a6 6 0 0 0-6 6v1a4 4 0 0 0 0 8h2v-3H6a4 4 0 0 1 0-8h1a6 6 0 0 1 12 0h1a4 4 0 0 1 0 8h-2v3h2a4 4 0 0 0 0-8V9a6 6 0 0 0-6-6zM9 20h6',
  risk: 'M12 2 2 20h20zM12 9v5M12 17h.01',
  similarity: 'M8 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM5 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM10 7l5 6',
  replay: 'M12 22a10 10 0 1 0-9.5-7M1 12l3-3 3 3M12 7v5l3 2',
  twin: 'M12 2 3 7v10l9 5 9-5V7zM3 7l9 5 9-5M12 12v10',
  whatif: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  graph: 'M5 8h4l3 8 3-11h4M3 8a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM17 5a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM10 19a2 2 0 1 0 4 0 2 2 0 0 0-4 0z',
  analytics: 'M3 3v18h18M7 15l3.5-4.5 3 3L21 6',
  alerts: 'M12 2a7 7 0 0 0-7 7c0 5-2 6-2 6h18s-2-1-2-6a7 7 0 0 0-7-7zM10 21a2 2 0 0 0 4 0',
  memory: 'M12 3a4 4 0 0 0-4 4v1a3 3 0 0 0 0 6v1a4 4 0 0 0 8 0v-1a3 3 0 0 0 0-6V7a4 4 0 0 0-4-4zM12 7v10',
  reports: 'M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7zM14 2v5h5M9 13h6M9 17h4',
  droplet: 'M12 2.7 6.6 9a7.2 7.2 0 1 0 10.8 0z',
  layers: 'M12 3 2 8l10 5 10-5zM2 13l10 5 10-5',
  activity: 'M3 12h4l3 8 4-16 3 8h4',
  shield: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z',
  network: 'M12 3v6M6 21v-4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4M9 21h6M12 9a3 3 0 1 0 0 0z',
  anchor: 'M12 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 5v16M5 12H2a10 10 0 0 0 20 0h-3M8 9h8',
  chart: 'M3 20h18M7 20V9M12 20V4M17 20v-7',
  play: 'M6 4l14 8-14 8z',
  pause: 'M8 5v14M16 5v14',
  refresh: 'M21 12a9 9 0 1 1-3-6.7M21 3v6h-6',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z',
  download: 'M12 3v12M7 11l5 5 5-5M4 21h16',
  file: 'M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM13 2v7h7',
  close: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-5M12 8h.01',
  arrowRight: 'M5 12h14M13 5l7 7-7 7',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  filter: 'M3 4h18l-7 8v7l-4 2v-9z',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 7v5l3.5 2',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  cpu: 'M6 6h12v12H6zM10 2v4M14 2v4M10 18v4M14 18v4M2 10h4M2 14h4M18 10h4M18 14h4',
  database: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3zM4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  sparkles: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.9 2.4 2.4.9-2.4.9L19 23l-.9-2.4-2.4-.9 2.4-.9z',
  gauge: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM13.5 10.5 19 5M3 20a10 10 0 1 1 18 0',
  flame: 'M12 22c4 0 6-2.7 6-6 0-4.5-4-6-4-10 0 0-2 1.5-2 4 0 1.5-1 2-2 2s-2-1-2-3c-1.5 1.5-2 3.5-2 6 0 3.3 2 7 6 7z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  pin: 'M12 22s7-7 7-12A7 7 0 1 0 5 10c0 5 7 12 7 12zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 22a8 8 0 0 1 16 0',
  eye: 'M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  x: 'M18 6 6 18M6 6l12 12',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  history: 'M3 3v6h6M3.5 9a9 9 0 1 1 2 8M12 8v4l3 2',
  compass: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM16.2 7.8l-2.1 6.3-6.3 2.1 2.1-6.3z',
  wave: 'M2 12c2 0 2-4 4-4s2 8 4 8 2-12 4-12 2 8 4 8 2-4 4-4',
  book: 'M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 17,
  className,
  strokeWidth = 1.7,
  fill = false,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
  fill?: boolean;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

/* --------------------------------------------------------------------------
 * Primitives
 * ------------------------------------------------------------------------ */

export function GlassCard({
  children,
  className,
  pad = true,
  glow = false,
  interactive = false,
  style,
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
  glow?: boolean;
  interactive?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cx('glass', pad && 'glass--pad', glow && 'glass--glow', interactive && 'glass--interactive', className)}
      style={style}
    >
      {children}
    </div>
  );
}

export function SectionHead({
  title,
  hint,
  icon,
  actions,
}: {
  title: string;
  hint?: string;
  icon?: IconName;
  actions?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div className="section-head__text">
        <h2>
          {icon && <Icon name={icon} size={17} className="t-dim" />}
          {title}
        </h2>
        {hint && <span className="section-head__hint">{hint}</span>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Chip({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span className={cx('chip', className ?? 'chip--neutral')} title={title}>
      {children}
    </span>
  );
}

export function BandChip({ band, sm }: { band: RiskBand; sm?: boolean }) {
  return <span className={cx(bandChipClass(band), sm && 'chip--sm')}>{band}</span>;
}

export function SeverityChip({ severity, sm }: { severity: Severity; sm?: boolean }) {
  return <span className={cx(severityChipClass(severity), sm && 'chip--sm')}>{severity}</span>;
}

export function StatusChip({ status, sm }: { status: WellStatus; sm?: boolean }) {
  const label = status === 'CRITICAL' ? 'CRITICAL HIT' : status;
  return <span className={cx(statusChipClass(status), sm && 'chip--sm')}>{label}</span>;
}

export function OutcomeChip({ outcome, sm }: { outcome: string; sm?: boolean }) {
  return <span className={cx(outcomeChipClass(outcome), sm && 'chip--sm')}>{outcome}</span>;
}

export function Progress({ value, tone = '#22d3ee' }: { value: number; tone?: string }) {
  return (
    <div className="progress">
      <div className="progress__fill" style={{ width: `${Math.max(0, Math.min(100, value))}%`, ['--tone' as string]: tone }} />
    </div>
  );
}

export function Spinner({ large = false }: { large?: boolean }) {
  return <div className={cx('spinner', large && 'spinner--lg')} role="status" aria-label="Loading" />;
}

export function Skeleton({ height = 14, width = '100%', radius = 9 }: { height?: number; width?: number | string; radius?: number }) {
  return <div className="skeleton" style={{ height, width, borderRadius: radius }} />;
}

export function AsyncBoundary({
  loading,
  error,
  empty,
  onRetry,
  children,
  skeletonRows = 4,
}: {
  loading: boolean;
  error: string | null;
  empty?: boolean;
  onRetry?: () => void;
  children: ReactNode;
  skeletonRows?: number;
}) {
  if (loading) {
    return (
      <div className="stack-list">
        {Array.from({ length: skeletonRows }).map((_, index) => (
          <Skeleton key={index} height={index === 0 ? 26 : 15} width={index % 2 === 0 ? '76%' : '92%'} />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="banner banner--danger">
        <Icon name="alerts" size={16} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>Could not load data</div>
          <div className="t-xs t-dim">{error}</div>
        </div>
        {onRetry && (
          <button type="button" className="btn btn--sm btn--ghost" onClick={onRetry}>
            <Icon name="refresh" size={13} /> Retry
          </button>
        )}
      </div>
    );
  }
  if (empty) {
    return (
      <div className="empty">
        <Icon name="search" size={22} />
        <div>No matching records</div>
      </div>
    );
  }
  return <>{children}</>;
}

export function EmptyState({ icon = 'search', title, hint }: { icon?: IconName; title: string; hint?: string }) {
  return (
    <div className="empty">
      <Icon name={icon} size={24} />
      <div style={{ fontWeight: 600, color: 'var(--text-dim)' }}>{title}</div>
      {hint && <div className="t-xs">{hint}</div>}
    </div>
  );
}

export function Banner({
  tone = 'info',
  icon,
  children,
  actions,
}: {
  tone?: 'info' | 'warn' | 'danger';
  icon?: IconName;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const fallback: IconName = tone === 'danger' ? 'alerts' : tone === 'warn' ? 'bolt' : 'info';
  return (
    <div className={cx('banner', `banner--${tone}`)}>
      <Icon name={icon ?? fallback} size={16} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {actions}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size,
}: {
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm';
}) {
  return (
    <div className="segmented" role="group">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          style={size === 'sm' ? { padding: '4px 9px', fontSize: 11.5 } : undefined}
        >
          {option.icon && <Icon name={option.icon} size={12} />}{' '}
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string; badge?: number | string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          className="tab"
          aria-selected={tab.value === value}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
          {tab.badge !== undefined && (
            <span className="chip chip--neutral chip--sm" style={{ marginLeft: 7 }}>
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  width,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  width?: number | string;
}) {
  return (
    <div className="search" style={{ width }}>
      <Icon name="search" size={14} />
      <input
        className="input"
        value={value}
        placeholder={placeholder ?? 'Search'}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
      />
      {value && (
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          style={{ position: 'absolute', right: 3, padding: 5, border: 0, background: 'transparent' }}
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          <Icon name="close" size={13} />
        </button>
      )}
    </div>
  );
}

export function MeterRow({
  label,
  value,
  max = 100,
  color,
  suffix = '%',
  animated = false,
  onClick,
}: {
  label: string;
  value: number;
  max?: number;
  color: string;
  suffix?: string;
  animated?: boolean;
  onClick?: () => void;
}) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="meter-row" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <span className="t-sm nowrap" title={label} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
      <span className="meter">
        <span
          className={cx('meter__fill', animated && 'meter__fill--animated')}
          style={{ width: `${percent}%`, background: `linear-gradient(90deg, ${color}, ${color}bb)` }}
        />
      </span>
      <span className="meter__value">
        {value.toFixed(value < 10 && !Number.isInteger(value) ? 1 : 0)}
        {suffix}
      </span>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  wide = false,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
  actions?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" style={wide ? { width: 'min(1180px, 100%)' } : undefined} role="dialog" aria-modal="true">
        <div className="modal__head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 className="t-h3">{title}</h3>
            {subtitle && <div className="t-xs t-mute">{subtitle}</div>}
          </div>
          {actions}
          <button type="button" className="btn btn--ghost btn--icon" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" size={15} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}

export function KpiCard({
  label,
  value,
  unit,
  sub,
  tone,
  progress,
  index = 0,
  icon,
}: {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  tone?: string;
  progress?: number;
  index?: number;
  icon?: IconName;
}) {
  const color = tone ?? '#22d3ee';
  return (
    <article className="kpi" style={{ ['--tone' as string]: color, animationDelay: `${index * 0.05}s` }}>
      <div className="kpi__head">
        <span className="t-label">{label}</span>
        {icon && <Icon name={icon} size={14} style={{ color }} className="t-dim" />}
      </div>
      <div className="kpi__value" style={{ color }}>
        {value}
        {unit && <span className="kpi__unit">{unit}</span>}
      </div>
      {sub && <div className="kpi__sub clamp-2">{sub}</div>}
      {progress !== undefined && <Progress value={progress} tone={color} />}
    </article>
  );
}

export function KeyValue({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="kv">
      {rows.map((row) => (
        <div key={row.label} style={{ display: 'contents' }}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack no-print">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="toast"
          style={{
            borderColor:
              toast.tone === 'danger'
                ? 'rgba(239,68,68,.5)'
                : toast.tone === 'warn'
                  ? 'rgba(245,158,11,.5)'
                  : toast.tone === 'success'
                    ? 'rgba(34,197,94,.5)'
                    : 'var(--border-glow)',
          }}
          onClick={() => dismissToast(toast.id)}
          role="status"
        >
          <div style={{ fontWeight: 640, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon
              name={toast.tone === 'danger' ? 'alerts' : toast.tone === 'success' ? 'check' : 'info'}
              size={14}
            />
            {toast.title}
          </div>
          {toast.detail && <div className="t-xs t-dim" style={{ marginTop: 4 }}>{toast.detail}</div>}
        </div>
      ))}
    </div>
  );
}

export function Sparkbars({
  values,
  color = '#22d3ee',
  height = 30,
}: {
  values: number[];
  color?: string;
  height?: number;
}) {
  const max = Math.max(1, ...values);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height }}>
      {values.map((value, index) => (
        <span
          key={index}
          style={{
            flex: 1,
            height: `${Math.max(6, (value / max) * 100)}%`,
            background: `linear-gradient(180deg, ${color}, ${color}55)`,
            borderRadius: 2,
            transition: 'height .5s var(--ease)',
          }}
        />
      ))}
    </div>
  );
}
