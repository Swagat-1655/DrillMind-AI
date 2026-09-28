import { useEffect, useMemo, useState } from 'react';
import { LineChart } from '../components/charts';
import { AsyncBoundary, Chip, GlassCard, Icon, SectionHead, Skeleton } from '../components/ui';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { HAZARD_COLOR, HAZARD_SHORT, cx, depth as fmtDepth, signed } from '../lib/format';
import { useAsync, useDebounced } from '../lib/hooks';
import type { Hazard } from '../lib/types';
import { useApp } from '../store';

const PARAM_ORDER = ['mudWeight', 'rpm', 'wob', 'rop', 'flowRate'] as const;

export default function WhatIfLab() {
  const { t } = useI18n();
  const { focusWellId, focusWell } = useApp();
  const focusKey = focusWellId ?? 'auto';

  const baseline = useAsync((signal) => api.whatifBaseline(focusKey, signal), [focusKey]);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const debounced = useDebounced(draft, 260);

  useEffect(() => {
    if (baseline.data) setDraft(baseline.data.baseline);
  }, [baseline.data]);

  const dirty = useMemo(() => {
    if (!baseline.data) return {};
    const out: Record<string, number> = {};
    for (const key of PARAM_ORDER) {
      const current = draft[key];
      const base = baseline.data.baseline[key];
      if (current !== undefined && Math.abs(current - base) > 1e-9) out[key] = current;
    }
    return out;
  }, [draft, baseline.data]);

  const simulation = useAsync(
    (signal) =>
      baseline.data
        ? api.whatif(focusKey, Object.keys(debounced).length ? debounced : {}, signal)
        : Promise.resolve(null),
    [focusKey, JSON.stringify(debounced)],
  );

  const ranges = baseline.data?.ranges ?? {};

  return (
    <div className="stack-list" style={{ gap: 18 }}>
      {/* ------------------------------------------------------------ header */}
      <GlassCard glow>
        <SectionHead
          icon="whatif"
          title={t('whatif.title')}
          hint={
            baseline.data
              ? `${baseline.data.wellName} · ${baseline.data.formation} · ${fmtDepth(baseline.data.depth)}`
              : t('whatif.subtitle')
          }
          actions={
            <>
              {Object.keys(dirty).length > 0 && (
                <Chip className="chip chip--moderate">{Object.keys(dirty).length} parameter(s) changed</Chip>
              )}
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => baseline.data && setDraft(baseline.data.baseline)}
                disabled={Object.keys(dirty).length === 0}
              >
                <Icon name="refresh" size={12} /> {t('whatif.resetToBaseline')}
              </button>
            </>
          }
        />
      </GlassCard>

      <div className="grid grid--split" style={{ alignItems: 'start' }}>
        {/* --------------------------------------------------------- controls */}
        <GlassCard>
          <SectionHead
            icon="sliders"
            title={t('whatif.parameters')}
            hint="Move a slider — the hazard ensemble is re-evaluated immediately"
          />
          <AsyncBoundary loading={baseline.loading} error={baseline.error} onRetry={baseline.reload}>
            <div className="stack-list" style={{ marginTop: 16, gap: 20 }}>
              {PARAM_ORDER.map((key) => {
                const spec = ranges[key];
                if (!spec) return null;
                const value = draft[key] ?? spec.min;
                const base = baseline.data?.baseline[key] ?? value;
                const changed = Math.abs(value - base) > 1e-9;
                return (
                  <div key={key} className="field">
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="t-label">
                        {spec.label} <span className="t-mute">({spec.unit})</span>
                      </span>
                      <span className="row row--tight">
                        {changed && (
                          <span className="t-xs t-mute">
                            baseline <span className="mono">{base.toFixed(2)}</span> →
                          </span>
                        )}
                        <span
                          className="mono"
                          style={{ fontSize: 16, color: changed ? '#22d3ee' : 'var(--text-dim)' }}
                        >
                          {value.toFixed(spec.step < 1 ? 2 : 0)}
                        </span>
                      </span>
                    </div>
                    <input
                      className="slider"
                      type="range"
                      min={spec.min}
                      max={spec.max}
                      step={spec.step}
                      value={value}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, [key]: Number(event.target.value) }))
                      }
                    />
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="t-xs t-mute">{spec.min}</span>
                      <span className="t-xs t-mute">{spec.max}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </AsyncBoundary>

          <div className="divider" style={{ margin: '16px 0' }} />
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {(
              [
                ['Heavier mud', { mudWeight: (baseline.data?.baseline.mudWeight ?? 10) + 0.6 }],
                ['Lighter mud', { mudWeight: (baseline.data?.baseline.mudWeight ?? 10) - 0.4 }],
                ['Gentle drilling', { wob: (baseline.data?.baseline.wob ?? 20) * 0.75, rop: (baseline.data?.baseline.rop ?? 15) * 0.7 }],
                ['Aggressive drilling', { wob: (baseline.data?.baseline.wob ?? 20) * 1.25, rop: (baseline.data?.baseline.rop ?? 15) * 1.35 }],
                ['Max hole cleaning', { flowRate: (baseline.data?.baseline.flowRate ?? 700) * 1.15 }],
              ] as [string, Record<string, number>][]
            ).map(([label, patch]) => (
              <button
                key={label}
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => setDraft((prev) => ({ ...prev, ...patch }))}
              >
                <Icon name="bolt" size={11} /> {label}
              </button>
            ))}
          </div>
        </GlassCard>

        {/* ------------------------------------------------------------ result */}
        <div className="stack-list">
          <GlassCard glow>
            <SectionHead
              icon="analytics"
              title={t('whatif.results')}
              hint="Change in probability at the current bit depth"
            />
            <AsyncBoundary loading={simulation.loading} error={simulation.error} onRetry={simulation.reload}>
              {simulation.data && (
                <>
                  <div className="banner banner--info" style={{ marginTop: 12 }}>
                    <Icon name="sparkles" size={15} />
                    <span style={{ lineHeight: 1.65 }}>{simulation.data.verdict}</span>
                  </div>

                  <div className="stack-list" style={{ marginTop: 14, gap: 9 }}>
                    {simulation.data.deltas.map((delta) => (
                      <div key={delta.hazard} className="glass" style={{ padding: '10px 12px' }}>
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <span className="row row--tight">
                            <span className="dot" style={{ background: HAZARD_COLOR[delta.hazard as Hazard], color: HAZARD_COLOR[delta.hazard as Hazard] }} />
                            <span className="t-sm" style={{ fontWeight: 620 }}>{HAZARD_SHORT[delta.hazard as Hazard]}</span>
                          </span>
                          <span className="row row--tight">
                            <span className="mono t-xs t-mute">
                              {delta.before.toFixed(0)}% → {delta.after.toFixed(0)}%
                            </span>
                            <span
                              className="mono t-sm"
                              style={{
                                color: delta.direction === 'down' ? '#22c55e' : delta.direction === 'up' ? '#ef4444' : 'var(--text-mute)',
                                minWidth: 62,
                                textAlign: 'right',
                              }}
                            >
                              {delta.direction === 'down' ? '▼' : delta.direction === 'up' ? '▲' : '—'} {signed(delta.delta, 1)}%
                            </span>
                          </span>
                        </div>
                        <div className="meter" style={{ marginTop: 8, height: 7 }}>
                          <span
                            className="meter__fill"
                            style={{
                              width: `${Math.max(2, Math.min(100, delta.after))}%`,
                              background: HAZARD_COLOR[delta.hazard as Hazard],
                            }}
                          />
                        </div>
                        <div className="t-xs t-mute" style={{ marginTop: 5 }}>
                          {delta.deltaPct === 0 ? 'unchanged' : `${signed(delta.deltaPct, 0)}% relative change`}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {!simulation.data && simulation.loading && (
                <div className="stack-list" style={{ marginTop: 12 }}>
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} height={54} />
                  ))}
                </div>
              )}
            </AsyncBoundary>
          </GlassCard>

          <GlassCard>
            <SectionHead icon="whatif" title={t('whatif.baseline')} hint="Current field programme" />
            <div className="grid grid--2" style={{ marginTop: 12, gap: 10 }}>
              {Object.entries(simulation.data?.baseline ?? baseline.data?.baseline ?? {}).map(([key, value]) => {
                const spec = ranges[key];
                const isDirty = key in dirty;
                return (
                  <div
                    key={key}
                    className={cx('glass')}
                    style={{
                      padding: '9px 11px',
                      border: `1px solid ${isDirty ? 'var(--border-glow)' : 'var(--border)'}`,
                    }}
                  >
                    <div className="t-label" style={{ fontSize: 9.5 }}>{spec?.label ?? key}</div>
                    <div className="mono t-sm" style={{ color: isDirty ? '#22d3ee' : undefined }}>
                      {Number(value).toFixed(spec && spec.step < 1 ? 2 : 0)}
                      {spec && <span className="t-xs t-mute" style={{ marginLeft: 4 }}>{spec.unit}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        </div>
      </div>

      {/* ------------------------------------------------------------ sweeps */}
      <section>
        <SectionHead
          icon="chart"
          title={t('whatif.sweeps')}
          hint="How each hazard responds as a single parameter is swept across its operating range"
        />
        <div className="grid grid--2" style={{ marginTop: 12 }}>
          {(simulation.data?.charts ?? []).map((chart) => (
            <GlassCard key={chart.parameter}>
              <SectionHead
                icon="sliders"
                title={chart.label}
                hint={`current ${chart.current.toFixed(2)} ${chart.unit} · baseline ${chart.baseline.toFixed(2)} ${chart.unit}`}
              />
              <div style={{ marginTop: 12 }}>
                <LineChart
                  series={[
                    { key: 'mudLoss', label: 'Mud loss', color: HAZARD_COLOR.MUDFLOSS, values: chart.points.map((point) => point.mudLoss), area: false },
                    { key: 'kick', label: 'Kick', color: HAZARD_COLOR.KICK, values: chart.points.map((point) => point.kick), area: false },
                    { key: 'stuckPipe', label: 'Stuck pipe', color: HAZARD_COLOR.STUCK_PIPE, values: chart.points.map((point) => point.stuckPipe), area: false },
                    { key: 'torqueSpike', label: 'Torque', color: HAZARD_COLOR.TORQUE_SPIKE, values: chart.points.map((point) => point.torqueSpike), area: false },
                    { key: 'overpressure', label: 'Overpressure', color: HAZARD_COLOR.OVERPRESSURE, values: chart.points.map((point) => point.overpressure), area: false },
                    { key: 'composite', label: 'Composite', color: '#22d3ee', values: chart.points.map((point) => point.composite), width: 2.6 },
                  ]}
                  xLabels={chart.points.map((point) => point.x.toFixed(chart.unit === 'gpm' || chart.unit === 'rpm' ? 0 : 1))}
                  height={220}
                  yMax={100}
                  yUnit="risk %"
                  xTitle={`${chart.label} (${chart.unit})`}
                  markerIndex={chart.points.findIndex((point) => Math.abs(point.x - chart.current) < 1e-6)}
                />
              </div>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------- interpretation */}
      <section>
        <GlassCard>
          <SectionHead icon="book" title="How to read this lab" />
          <div className="grid grid--2" style={{ marginTop: 12 }}>
            <ul className="bullets">
              <li>The engine re-runs all six hazard models at the bit depth, then at the +50 m, +100 m and next-formation windows.</li>
              <li>
                Deltas are probability points, not a promise — treat a fall under 3 points as noise and check the confidence
                on the Risk Intelligence page.
              </li>
            </ul>
            <ul className="bullets">
              <li>
                Raising mud weight closes the overbalance term (kick and overpressure down) but tightens the fracture
                margin, which pushes mud-loss risk up. The sweep curves make that trade-off explicit.
              </li>
              <li>Narrow the operating window and stuck-pipe / torque risk rises with hole-cleaning stress.</li>
            </ul>
          </div>
          {focusWell && (
            <div className="row" style={{ marginTop: 14, gap: 12, flexWrap: 'wrap' }}>
              <Chip className="chip chip--neutral">formation {focusWell.formation}</Chip>
              <Chip className="chip chip--neutral">TD {fmtDepth(focusWell.totalDepthMd)}</Chip>
              <Chip className="chip chip--neutral">pore {focusWell.poreEmw.toFixed(2)} ppg</Chip>
              <Chip className="chip chip--neutral">frac {focusWell.fracEmw.toFixed(2)} ppg</Chip>
              <span className="t-xs t-mute">
                Simulating{' '}
                <strong className="mono">{baseline.data?.wellName ?? focusWell.name}</strong> — change the focus well from
                the navbar to simulate a different programme.
              </span>
            </div>
          )}
        </GlassCard>
      </section>
    </div>
  );
}
