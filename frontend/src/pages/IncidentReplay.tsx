import { useEffect, useMemo, useState } from 'react';
import { LineChart } from '../components/charts';
import {
  AsyncBoundary,
  Chip,
  GlassCard,
  Icon,
  OutcomeChip,
  SectionHead,
  Segmented,
  SeverityChip,
  StatusChip,
} from '../components/ui';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { HAZARD_COLOR, HAZARD_SHORT, cx, depth as fmtDepth, formatDate, num, usd } from '../lib/format';
import { useAsync, useTicker } from '../lib/hooks';
import type { Hazard, Severity } from '../lib/types';
import { useApp } from '../store';

const EVENT_TYPES: Hazard[] = ['MUDFLOSS', 'KICK', 'OVERPRESSURE', 'STUCK_PIPE', 'TORQUE_SPIKE', 'CEMENTING_FAILURE', 'BIT_DAMAGE'];

export default function IncidentReplay() {
  const { t } = useI18n();
  const { focusWellId, setFocusWellId } = useApp();
  const [type, setType] = useState<'all' | Hazard>('all');
  const [severity, setSeverity] = useState<'all' | Severity>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  const feed = useAsync(
    (signal) =>
      api.incidents(
        {
          type: type === 'all' ? undefined : type,
          severity: severity === 'all' ? undefined : severity,
          sort: 'severity',
          limit: 60,
        },
        signal,
      ),
    [type, severity],
  );

  const detail = useAsync(
    (signal) => (selected ? api.incident(selected, signal) : Promise.resolve(null)),
    [selected],
  );

  const samples = detail.data?.replay.samples ?? [];
  const maxStep = Math.max(0, samples.length - 1);

  // Playback clock.
  const tick = useTicker(420);
  useEffect(() => {
    if (!playing) return;
    setStep((prev) => {
      if (prev >= maxStep) {
        setPlaying(false);
        return prev;
      }
      return prev + 1;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, playing, maxStep]);

  useEffect(() => {
    if (!selected && feed.data?.incidents.length) setSelected(feed.data.incidents[0].id);
  }, [feed.data, selected]);

  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [selected]);

  const current = samples[Math.min(step, maxStep)];

  const series = useMemo(
    () => [
      { key: 'torque', label: 'Torque (kN·m)', color: '#f97316', values: samples.map((sample) => sample.torque), area: false },
      { key: 'mudWeight', label: 'Mud weight (ppg)', color: '#22d3ee', values: samples.map((sample) => sample.mudWeight), area: false },
      { key: 'spp', label: 'Standpipe pressure (psi)', color: '#a78bfa', values: samples.map((sample) => sample.spp / 100), area: false },
      { key: 'rop', label: 'ROP (m/hr)', color: '#22c55e', values: samples.map((sample) => sample.rop), area: false },
      { key: 'pitVolume', label: 'Pit volume (m³)', color: '#ef4444', values: samples.map((sample) => sample.pitVolume), area: false },
      { key: 'gas', label: 'Total gas (%)', color: '#f59e0b', values: samples.map((sample) => sample.gas), area: false },
    ],
    [samples],
  );

  return (
    <div className="stack-list" style={{ gap: 18 }}>
      {/* --------------------------------------------------------- filters */}
      <GlassCard>
        <SectionHead
          icon="replay"
          title={t('replay.title')}
          hint={t('replay.subtitle')}
          actions={
            <>
              <Chip className="chip chip--cyan">{feed.data?.count ?? 0} incidents</Chip>
              {focusWellId && (
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => setFocusWellId(focusWellId)}>
                  <Icon name="target" size={12} /> focus {focusWellId}
                </button>
              )}
            </>
          }
        />
        <div className="row" style={{ gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <Segmented
            options={[
              { value: 'all', label: t('common.all') },
              ...EVENT_TYPES.map((item) => ({ value: item, label: HAZARD_SHORT[item] })),
            ]}
            value={type}
            onChange={setType}
            size="sm"
          />
          <Segmented
            options={[
              { value: 'all', label: 'Any severity' },
              { value: 'CRITICAL', label: 'Critical' },
              { value: 'HIGH', label: 'High' },
              { value: 'MEDIUM', label: 'Medium' },
              { value: 'LOW', label: 'Low' },
            ]}
            value={severity}
            onChange={setSeverity}
            size="sm"
          />
        </div>
      </GlassCard>

      <div className="grid grid--split" style={{ alignItems: 'start' }}>
        {/* ------------------------------------------------------- incident list */}
        <GlassCard pad={false}>
          <div style={{ padding: '16px 18px 8px' }}>
            <SectionHead icon="history" title="Incident library" hint="Click an incident to load its replay" />
          </div>
          <div className="scroll-y" style={{ maxHeight: 520, padding: '4px 12px 14px' }}>
            <AsyncBoundary loading={feed.loading} error={feed.error} onRetry={feed.reload}>
              {(feed.data?.incidents ?? []).map((incident) => (
                <button
                  key={incident.id}
                  type="button"
                  onClick={() => setSelected(incident.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    marginBottom: 5,
                    borderRadius: 12,
                    border: `1px solid ${incident.id === selected ? 'var(--border-glow)' : 'transparent'}`,
                    background: incident.id === selected ? 'rgba(34,211,238,.1)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="row row--tight">
                      <span className="dot" style={{ background: HAZARD_COLOR[incident.type], color: HAZARD_COLOR[incident.type] }} />
                      <span style={{ fontWeight: 630, fontSize: 12.8 }}>{incident.label}</span>
                    </span>
                    <SeverityChip severity={incident.severity} sm />
                  </div>
                  <div className="t-xs t-mute" style={{ marginTop: 4 }}>
                    {incident.wellName} · {incident.formation} · {fmtDepth(incident.depth)}
                  </div>
                  <div className="row row--tight" style={{ marginTop: 6 }}>
                    <span className="mono t-xs t-dim">{num(incident.nptHours)} hr NPT</span>
                    <span className="t-xs t-mute">·</span>
                    <span className="mono t-xs t-dim">{usd(incident.costUsd)}</span>
                    <span className="spacer" />
                    <span className="t-xs t-mute">{formatDate(incident.date)}</span>
                  </div>
                </button>
              ))}
            </AsyncBoundary>
          </div>
        </GlassCard>

        {/* ------------------------------------------------------------- replay */}
        <div className="stack-list">
          <AsyncBoundary loading={detail.loading} error={detail.error} onRetry={detail.reload}>
            {detail.data && current && (
              <>
                <GlassCard glow>
                  <SectionHead
                    icon="play"
                    title={detail.data.label}
                    hint={`${detail.data.well.name} · ${detail.data.formation} · ${fmtDepth(detail.data.depth)}`}
                    actions={
                      <>
                        <SeverityChip severity={detail.data.severity} />
                        <StatusChip status={detail.data.well.status} />
                      </>
                    }
                  />

                  {/* transport */}
                  <div className="row" style={{ gap: 10, marginTop: 14 }}>
                    <button
                      type="button"
                      className={cx('btn', 'btn--sm', playing ? 'btn--ghost' : 'btn--primary')}
                      onClick={() => setPlaying((prev) => !prev)}
                      disabled={step >= maxStep}
                    >
                      <Icon name={playing ? 'pause' : 'play'} size={13} fill={!playing} />
                      {playing ? t('replay.pause') : t('replay.play')}
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      onClick={() => {
                        setStep(0);
                        setPlaying(false);
                      }}
                    >
                      <Icon name="refresh" size={13} /> {t('replay.restart')}
                    </button>
                    <input
                      className="slider"
                      type="range"
                      min={0}
                      max={maxStep}
                      value={step}
                      onChange={(event) => {
                        setStep(Number(event.target.value));
                        setPlaying(false);
                      }}
                      style={{ flex: 1 }}
                    />
                    <span className="mono t-xs t-mute nowrap">
                      {step + 1} / {samples.length}
                    </span>
                  </div>

                  {/* live readouts */}
                  <div className="grid grid--4" style={{ marginTop: 14, gap: 10 }}>
                    {[
                      ['Measured depth', fmtDepth(current.md)],
                      ['Surface torque', `${current.torque.toFixed(1)} kN·m`],
                      ['Mud weight', `${current.mudWeight.toFixed(2)} ppg`],
                      ['Standpipe pressure', `${current.spp.toFixed(0)} psi`],
                      ['ROP', `${current.rop.toFixed(2)} m/hr`],
                      ['Hookload', `${current.hookload.toFixed(1)} klbf`],
                      ['Pit volume', `${current.pitVolume.toFixed(1)} m³`],
                      ['Total gas', `${current.gas.toFixed(2)} %`],
                    ].map(([label, value]) => (
                      <div key={label} className="glass" style={{ padding: '9px 11px' }}>
                        <div className="t-label" style={{ fontSize: 9.5 }}>{label}</div>
                        <div className="mono" style={{ fontSize: 15 }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {current.action && (
                    <div className="banner banner--warn" style={{ marginTop: 12 }}>
                      <Icon name="bolt" size={15} />
                      <span>
                        <strong>t={current.t}:</strong> {current.action}
                      </span>
                    </div>
                  )}
                </GlassCard>

                {/* ------------------------------------------------ parameter traces */}
                <GlassCard>
                  <SectionHead
                    icon="activity"
                    title={t('replay.parameters')}
                    hint="The cyan marker tracks the replay position; follow the divergence"
                  />
                  <div style={{ marginTop: 12 }}>
                    <LineChart
                      series={series}
                      xLabels={samples.map((sample) => String(sample.t))}
                      height={270}
                      markerIndex={step}
                      xTitle="sample (≈1 s cadence, downsampled)"
                    />
                  </div>
                </GlassCard>

                <div className="grid grid--2">
                  <GlassCard>
                    <SectionHead icon="clock" title={t('replay.timeline')} hint="Depth progression and engineer actions" />
                    <div className="timeline-track" style={{ marginTop: 16 }}>
                      <span className="timeline-track__axis" />
                      {detail.data.replay.actions.map((action) => (
                        <span
                          key={action.label}
                          className="timeline-node"
                          style={{
                            left: `${(action.at / Math.max(1, maxStep)) * 92 + 4}%`,
                            background: '#f97316',
                          }}
                          title={action.label}
                        />
                      ))}
                      <span
                        className="timeline-node"
                        style={{
                          left: `${(step / Math.max(1, maxStep)) * 92 + 4}%`,
                          background: '#22d3ee',
                          width: 15,
                          height: 15,
                          boxShadow: '0 0 14px #22d3ee',
                        }}
                      />
                    </div>
                    <div className="stack-list" style={{ marginTop: 18 }}>
                      {samples.map((sample) =>
                        sample.action ? (
                          <div
                            key={sample.t}
                            className={cx('row', sample.t <= step && 't-dim')}
                            style={{ gap: 10, opacity: sample.t <= step ? 1 : 0.42 }}
                          >
                            <span
                              className="dot"
                              style={{ background: sample.t <= step ? '#f97316' : '#64748b', color: sample.t <= step ? '#f97316' : '#64748b' }}
                            />
                            <span className="mono t-xs t-mute" style={{ width: 34 }}>
                              t={sample.t}
                            </span>
                            <span className="t-sm" style={{ flex: 1 }}>{sample.action}</span>
                            <span className="mono t-xs t-mute">{fmtDepth(sample.md)}</span>
                          </div>
                        ) : null,
                      )}
                    </div>
                  </GlassCard>

                  <div className="stack-list">
                    <GlassCard>
                      <SectionHead icon="check" title={t('replay.outcome')} />
                      <div className="grid grid--2" style={{ marginTop: 12, gap: 10 }}>
                        {[
                          ['Mitigation', detail.data.mitigation],
                          ['Outcome', detail.data.outcome],
                          ['Severity', detail.data.severity],
                          ['Date', formatDate(detail.data.date)],
                          ['NPT', `${num(detail.data.nptHours)} hr`],
                          ['Cost', usd(detail.data.costUsd)],
                          ['Mud weight', `${detail.data.mudWeightBefore.toFixed(2)} → ${detail.data.mudWeightAfter.toFixed(2)} ppg`],
                          ['Formation', detail.data.formation],
                        ].map(([label, value]) => (
                          <div key={label} className="glass" style={{ padding: '9px 11px' }}>
                            <div className="t-label" style={{ fontSize: 9.5 }}>{label}</div>
                            {label === 'Outcome' ? (
                              <OutcomeChip outcome={value} sm />
                            ) : label === 'Mitigation' ? (
                              <div className="t-xs" style={{ marginTop: 2 }}>{value}</div>
                            ) : (
                              <div className="mono t-sm">{value}</div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="banner banner--info" style={{ marginTop: 12 }}>
                        <Icon name="info" size={15} />
                        <span style={{ lineHeight: 1.65 }}>{detail.data.insight}</span>
                      </div>
                    </GlassCard>

                    <GlassCard>
                      <SectionHead
                        icon="history"
                        title={t('replay.related')}
                        hint="Same hazard type within 250 m of this depth"
                      />
                      <div className="stack-list" style={{ marginTop: 12 }}>
                        {detail.data.related.map((row) => (
                          <button
                            key={row.id}
                            type="button"
                            onClick={() => setSelected(row.id)}
                            className="row"
                            style={{
                              justifyContent: 'space-between',
                              width: '100%',
                              background: 'transparent',
                              border: 0,
                              cursor: 'pointer',
                              textAlign: 'left',
                              padding: '6px 0',
                            }}
                          >
                            <span>
                              <span style={{ display: 'block', fontSize: 12.6, fontWeight: 600 }}>{row.wellName}</span>
                              <span className="t-xs t-mute">
                                {fmtDepth(row.depth)} · {formatDate(row.date)}
                              </span>
                            </span>
                            <span className="row row--tight">
                              <SeverityChip severity={row.severity} sm />
                              <OutcomeChip outcome={row.outcome} sm />
                            </span>
                          </button>
                        ))}
                        {detail.data.related.length === 0 && (
                          <span className="t-sm t-mute">No comparable incidents recorded nearby.</span>
                        )}
                      </div>
                    </GlassCard>
                  </div>
                </div>
              </>
            )}
            {!detail.data && !detail.loading && (
              <div className="empty">
                <Icon name="replay" size={22} />
                Select an incident to replay it parameter by parameter.
              </div>
            )}
          </AsyncBoundary>
        </div>
      </div>
    </div>
  );
}
