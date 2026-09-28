import type { Hazard, RiskBand, Severity, WellStatus } from './types';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

const nf = (digits: number) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function num(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return nf(digits).format(value);
}

export function compact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 10_000) return `${(value / 1000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
  return num(value, abs < 10 && !Number.isInteger(value) ? 1 : 0);
}

export function usd(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `$${(value / 1_000_000).toFixed(digits)}M`;
}

export function pct(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function depth(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${num(value, digits)} m`;
}

export function signed(value: number, digits = 1): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(digits)}`;
}

// --------------------------------------------------------------------------
// Tone mapping
// --------------------------------------------------------------------------

export const BAND_COLOR: Record<RiskBand, string> = {
  LOW: '#22c55e',
  MODERATE: '#f59e0b',
  HIGH: '#f97316',
  CRITICAL: '#ef4444',
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  LOW: '#22c55e',
  MEDIUM: '#f59e0b',
  HIGH: '#f97316',
  CRITICAL: '#ef4444',
};

export const STATUS_COLOR: Record<WellStatus, string> = {
  ACTIVE: '#38bdf8',
  HISTORICAL: '#22c55e',
  RISK: '#f97316',
  CRITICAL: '#ef4444',
};

export const HAZARD_COLOR: Record<Hazard, string> = {
  MUDFLOSS: '#38bdf8',
  KICK: '#ef4444',
  OVERPRESSURE: '#a78bfa',
  TORQUE_SPIKE: '#f59e0b',
  STUCK_PIPE: '#f97316',
  CEMENTING_FAILURE: '#10b981',
  BIT_DAMAGE: '#ec4899',
};

export const HAZARD_SHORT: Record<Hazard, string> = {
  MUDFLOSS: 'Mud Loss',
  KICK: 'Kick',
  OVERPRESSURE: 'Overpressure',
  TORQUE_SPIKE: 'Torque',
  STUCK_PIPE: 'Stuck Pipe',
  CEMENTING_FAILURE: 'Cementing',
  BIT_DAMAGE: 'Bit Damage',
};

export const HAZARD_ORDER: Hazard[] = [
  'MUDFLOSS',
  'KICK',
  'OVERPRESSURE',
  'STUCK_PIPE',
  'TORQUE_SPIKE',
  'CEMENTING_FAILURE',
];

export const TONE_COLOR: Record<string, string> = {
  cyan: '#22d3ee',
  blue: '#3b82f6',
  violet: '#a78bfa',
  orange: '#f97316',
  amber: '#f59e0b',
  green: '#22c55e',
  red: '#ef4444',
  magenta: '#ec4899',
};

export function tone(tone: string | undefined, fallback = '#22d3ee'): string {
  return (tone && TONE_COLOR[tone]) || fallback;
}

export function bandChipClass(band: RiskBand): string {
  return `chip chip--${band.toLowerCase()}`;
}

export function severityChipClass(severity: Severity): string {
  return severity === 'MEDIUM' ? 'chip chip--moderate' : `chip chip--${severity.toLowerCase()}`;
}

export function statusChipClass(status: WellStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'chip chip--cyan';
    case 'HISTORICAL':
      return 'chip chip--green';
    case 'RISK':
      return 'chip chip--high';
    default:
      return 'chip chip--critical';
  }
}

export function outcomeChipClass(outcome: string): string {
  switch (outcome) {
    case 'SUCCESS':
      return 'chip chip--green';
    case 'PARTIAL':
      return 'chip chip--moderate';
    default:
      return 'chip chip--critical';
  }
}

/** 0-100 score → a heat colour across the platform palette. */
export function scoreColor(score: number): string {
  if (score >= 78) return BAND_COLOR.CRITICAL;
  if (score >= 58) return BAND_COLOR.HIGH;
  if (score >= 34) return BAND_COLOR.MODERATE;
  return BAND_COLOR.LOW;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  const seconds = (Date.now() - date.getTime()) / 1000;
  if (Number.isNaN(seconds)) return iso;
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}hr ago`;
  if (seconds < 2592000) return `${Math.round(seconds / 86400)}d ago`;
  if (seconds < 31536000) return `${Math.round(seconds / 2592000)}mo ago`;
  return `${Math.round(seconds / 31536000)}y ago`;
}

export function initials(name: string): string {
  return name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Nice axis ticks for a value range. */
export function ticks(min: number, max: number, count = 5): number[] {
  if (max <= min) return [min];
  const span = max - min;
  const rough = span / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / magnitude;
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * magnitude;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let value = start; value <= max + 1e-9; value += step) out.push(Number(value.toFixed(6)));
  return out;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
