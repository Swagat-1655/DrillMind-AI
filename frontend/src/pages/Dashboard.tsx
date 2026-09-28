import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DepthHeatStrip, Gauge, LineChart } from '../components/charts';
import {
  AsyncBoundary,
  BandChip,
  Chip,
  GlassCard,
  Icon,
  KpiCard,
  MeterRow,
  SectionHead,
  SeverityChip,
  Skeleton,
  StatusChip,
} from '../components/ui';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import {
  HAZARD_COLOR,
  HAZARD_SHORT,
  bandChipClass,
  compact,
  cx,
  depth as fmtDepth,
  num,
  pct,
  scoreColor,
  timeAgo,
  usd,
} from '../lib/format';
import { useAsync, usePolling } from '../lib/hooks';
import type { Hazard } from '../lib/types';
import { useApp } from '../store';

export default function Dashboard() {
  const { t, isHindi } = useI18n();
  const navigate = useNavigate();
  const { focusWellId, focusWell } = useApp();
  const focusKey = focusWellId ?? 'auto';

  const kpis = useAsync((signal) => api.kpis(focusWellId ?? undefined, signal), [focusKey]);
  const profile = useAsync((signal) => api.riskProfile(focusKey, 100, signal), [focusKey]);
  const risk = useAsync((signal) => api.wellRisk(focusKey, undefined, signal), [focusKey]);
  const telemetry = useAsync((signal) => api.telemetry(focusKey, 70, 2, signal), [focusKey]);

  // The channel feed is re-polled so the traces visibly advance.
  usePolling(() => telemetry.reload(), 4000, Boolean(focusWellId));

  const channels = telemetry.data?.channels ?? [];
  const drillChannels = channels.filter((channel) =>
    ['depth', 'rop', 'wob', 'rpm', 'torque', 'spp', 'flowRate', 'mudWeight', 'ecd', 'gas', 'hookload', 'vibration'].includes(
      channel.key,
    ),
  );

  const history = telemetry.data?.history ?? [];
  const sparkFor = useMemo(
    () => (key: string) => history.map((row) => Number((row as unknown as Record<string, number>)[key] ?? 0)),
    [history],
  );

  return (
    <div className="stack-list" style={{ gap: 20 }}>
      {/* ------------------------------------------------------------- KPIs */}
      <section>
        <SectionHead
          icon="dashboard"
          title={t('dashboard.kpiTitle')}
          hint={
            focusWell
              ? `${focusWell.name} · ${focusWell.field} · ${focusWell.formation} · ${focusWell.status}`
              : undefined
          }
          actions={
            <>
              <button type="button" className="btn btn--sm" onClick={() => navigate('/map')}>
                <Icon name="map" size={13} /> {t('nav.map')}
              </button>
              <button type="button" className="btn btn--sm btn--primary" onClick={() => navigate('/copilot')}>
                <Icon name="copilot" size={13} /> {t('nav.copilot')}
              </button>
            </>
          }
        />
        <div className="grid grid--kpi" style={{ marginTop: 12 }}>
          {kpis.loading &&
            Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="kpi">
                <Skeleton height={11} width="60%" />
                <Skeleton height={28} width="80%" />
                <Skeleton height={10} width="90%" />
              </div>
            ))}
          {kpis.data?.cards.map((card, index) => (
            <KpiCard
              key={card.key}
              label={t(`kpi.${card.key}`, card.label)}
              value={
                card.key === 'activeDepth'
                  ? num(card.value)
                  : card.key === 'predictedIncidents'
                    ? card.value.toFixed(1)
                    : num(card.value)
              }
              unit={card.unit}
              sub={card.sub}
              tone={card.tone}
              progress={card.progress}
              index={index}
              icon={iconForKpi(card.key)}
            />
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------- telemetry */}
      <section>
        <SectionHead
          icon="activity"
          title={t('dashboard.telemetryTitle')}
          hint={t('dashboard.telemetrySub')}
          actions={
            telemetry.data && (
              <Chip className={telemetry.data.status === 'NORMAL' ? 'chip chip--green' : telemetry.data.status === 'WARNING' ? 'chip chip--moderate' : 'chip chip--critical'}>
                {telemetry.data.status}
              </Chip>
            )
          }
        />
        <AsyncBoundary loading={telemetry.loading} error={telemetry.error} onRetry={telemetry.reload}>
          {telemetry.data && (
            <div className="grid grid--split-wide" style={{ marginTop: 12 }}>
              <GlassCard>
                <LineChart
                  series={[
                    { key: 'torque', label: 'Torque (kN·m)', color: '#f97316', values: sparkFor('torque'), area: false },
                    { key: 'rop', label: 'ROP (m/hr)', color: '#22d3ee', values: sparkFor('rop'), area: false },
                    { key: 'gas', label: 'Total gas (%)', color: '#ef4444', values: sparkFor('gas'), area: false },
                    { key: 'wob', label: 'WOB (klbf)', color: '#a78bfa', values: sparkFor('wob'), area: false },
                  ]}
                  xLabels={history.map((row) => `${Math.abs(Math.round((telemetry.data!.timestamp - row.t) / 60))}m`)}
                  height={216}
                  yUnit="channel"
                  onHover={() => undefined}
                />
                <div className="grid grid--4" style={{ marginTop: 14, gap: 10 }}>
                  {drillChannels.slice(0, 8).map((channel) => (
                    <div key={channel.key} className="glass" style={{ padding: '9px 11px' }}>
                      <div className="t-label" style={{ fontSize: 9.6 }}>{channel.label}</div>
                      <div className="mono" style={{ fontSize: 17, color: '#22d3ee' }}>
                        {channel.value.toFixed(channel.precision)}
                        <span className="t-xs t-mute" style={{ marginLeft: 3 }}>{channel.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <div className="stack-list">
                <GlassCard>
                  <SectionHead icon="bolt" title="Drilling state" />
                  <div className="stack-list" style={{ marginTop: 12 }}>
                    {drillChannels.slice(8).map((channel) => (
                      <div key={channel.key} className="row" style={{ justifyContent: 'space-between' }}>
                        <span className="t-sm t-dim">{channel.label}</span>
                        <span className="mono t-sm">
                          {channel.value.toFixed(channel.precision)} <span className="t-xs t-mute">{channel.unit}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </GlassCard>

                <GlassCard>
                  <SectionHead icon="alerts" title="Control-limit surveillance" hint={`${telemetry.data.alarms.length} active`} />
                  <div className="stack-list" style={{ marginTop: 12 }}>
                    {telemetry.data.alarms.length === 0 && (
                      <div className="row row--tight t-sm" style={{ color: '#22c55e' }}>
                        <Icon name="check" size={14} /> All channels inside their operating envelope.
                      </div>
                    )}
                    {telemetry.data.alarms.map((alarm) => (
                      <div key={alarm.message} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                        <Icon
                          name="alerts"
                          size={14}
                          style={{ color: alarm.level === 'CRITICAL' ? '#ef4444' : alarm.level === 'HIGH' ? '#f97316' : '#f59e0b', marginTop: 2 }}
                        />
                        <div>
                          <div className="t-sm">{alarm.message}</div>
                          <div className="t-xs t-mute">{alarm.channel} · {alarm.level}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              </div>
            </div>
          )}
        </AsyncBoundary>
      </section>

      {/* ------------------------------------------------- hazard prediction */}
      <section>
        <SectionHead
          icon="risk"
          title={t('dashboard.hazardTitle')}
          hint={t('dashboard.hazardSub')}
          actions={
            risk.data && (
              <Chip className={bandChipClass(risk.data.summary.band)}>
                composite {pct(risk.data.summary.composite)} · {risk.data.summary.band}
              </Chip>
            )
          }
        />
        <AsyncBoundary loading={risk.loading} error={risk.error} onRetry={risk.reload}>
          {risk.data && (
            <div className="grid grid--split-wide" style={{ marginTop: 12 }}>
              <GlassCard>
                <div className="grid grid--3" style={{ gap: 10 }}>
                  {risk.data.predictions.map((prediction) => (
                    <div
                      key={prediction.hazard}
                      style={{ textAlign: 'center', cursor: 'pointer' }}
                      onClick={() => navigate(`/risk?hazard=${prediction.hazard}`)}
                      title={`${prediction.label} — ${prediction.rationale}`}
                    >
                      <Gauge
                        value={prediction.probabilityPct}
                        confidence={prediction.confidencePct}
                        color={HAZARD_COLOR[prediction.hazard]}
                        size={148}
                        caption={HAZARD_SHORT[prediction.hazard]}
                      />
                      <div className="t-xs t-mute">
                        driver: {prediction.topDrivers[0]?.label ?? '—'}
                      </div>
                      <div className="t-xs" style={{ color: HAZARD_COLOR[prediction.hazard] }}>
                        {prediction.band}
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <div className="stack-list">
                <GlassCard>
                  <SectionHead icon="clock" title={t('risk.predictiveWindows')} />
                  <div className="stack-list" style={{ marginTop: 12 }}>
                    {risk.data.windows.map((window) => (
                      <div
                        key={window.key}
                        className="glass"
                        style={{ padding: '10px 12px', background: 'color-mix(in srgb, var(--surface-solid) 55%, transparent)' }}
                      >
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <span className="t-sm" style={{ fontWeight: 620 }}>{window.label}</span>
                          <span className="mono t-xs t-mute">{fmtDepth(window.depth)}</span>
                        </div>
                        <div className="row" style={{ gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
                          {window.predictions.map((prediction) => (
                            <span
                              key={prediction.hazard}
                              className="chip chip--neutral"
                              style={{ textTransform: 'none', letterSpacing: 0, fontSize: 10.5 }}
                              title={prediction.label}
                            >
                              <span className="dot" style={{ background: HAZARD_COLOR[prediction.hazard], color: HAZARD_COLOR[prediction.hazard] }} />
                              {HAZARD_SHORT[prediction.hazard]} {prediction.probabilityPct.toFixed(0)}%
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassCard>

                <GlassCard>
                  <SectionHead icon="sparkles" title={t('dashboard.actionsTitle')} />
                  <ul className="bullets" style={{ marginTop: 10 }}>
                    {risk.data.summary.actions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </GlassCard>
              </div>
            </div>
          )}
        </AsyncBoundary>
      </section>

      {/* ------------------------------------------------------ depth heatmap */}
      <section>
        <SectionHead icon="layers" title={t('dashboard.depthTitle')} hint={t('dashboard.depthSub')} />
        <div className="grid grid--split-wide" style={{ marginTop: 12 }}>
          <GlassCard>
            <AsyncBoundary loading={profile.loading} error={profile.error} onRetry={profile.reload}>
              {profile.data && (
                <LineChart
                  series={(profile.data.hazards as Hazard[]).slice(0, 5).map((hazard) => ({
                    key: hazard,
                    label: HAZARD_SHORT[hazard],
                    color: HAZARD_COLOR[hazard],
                    values: profile.data!.samples.map((row) => Number(row[hazard] ?? 0)),
                    area: false,
                    width: 1.8,
                  }))}
                  xLabels={profile.data.samples.map((row) => `${row.depth}`)}
                  height={248}
                  yMax={100}
                  yUnit="risk %"
                  xTitle="measured depth (m)"
                  refLines={[
                    { value: 78, label: 'critical', color: '#ef4444' },
                    { value: 58, label: 'high', color: '#f97316' },
                  ]}
                />
              )}
            </AsyncBoundary>
          </GlassCard>
          <GlassCard>
            <SectionHead icon="gauge" title="Banded risk along depth" hint="Deepest first, as a depth log reads" />
            <div style={{ marginTop: 12 }}>
              <AsyncBoundary loading={profile.loading} error={profile.error} onRetry={profile.reload}>
                {profile.data && (
                  <DepthHeatStrip
                    bands={profile.data.bands}
                    activeDepth={focusWell?.currentDepthMd}
                    height={330}
                    onSelect={() => undefined}
                  />
                )}
              </AsyncBoundary>
            </div>
          </GlassCard>
        </div>
      </section>

      {/* ------------------------------------------------ nearby / analogues */}
      <section>
        <div className="grid grid--split">
          <GlassCard pad={false}>
            <div style={{ padding: '16px 18px 8px' }}>
              <SectionHead
                icon="pin"
                title={t('dashboard.nearbyTitle')}
                hint={`${kpis.data?.nearby.length ?? 0} offsets inside 15 km`}
                actions={
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => navigate('/map')}>
                    {t('nav.map')} <Icon name="arrowRight" size={12} />
                  </button>
                }
              />
            </div>
            <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Well</th>
                    <th>Dist.</th>
                    <th>Formation</th>
                    <th>Events</th>
                    <th>Risk</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(kpis.data?.nearby ?? []).slice(0, 8).map((well) => (
                    <tr key={well.id} className="clickable" onClick={() => navigate(`/map?well=${well.id}`)}>
                      <td className="cell-strong nowrap">{well.name}</td>
                      <td className="cell-num">{well.distanceKm.toFixed(1)} km</td>
                      <td className="t-sm t-dim">{well.formation}</td>
                      <td className="cell-num">{well.eventCount}</td>
                      <td>
                        <span className="row row--tight" style={{ gap: 7 }}>
                          <span className="meter" style={{ width: 46, height: 6 }}>
                            <span
                              className="meter__fill"
                              style={{ width: `${well.riskScore}%`, background: scoreColor(well.riskScore) }}
                            />
                          </span>
                          <span className="mono t-xs">{well.riskScore.toFixed(0)}</span>
                        </span>
                      </td>
                      <td>
                        <StatusChip status={well.status} sm />
                      </td>
                    </tr>
                  ))}
                  {(kpis.data?.nearby.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={6} className="t-mute t-sm">No offset wells inside the search radius.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>

          <GlassCard>
            <SectionHead icon="similarity" title={t('dashboard.analogueTitle')} hint="Reusable lessons transfer from these wells" />
            <div className="stack-list" style={{ marginTop: 12 }}>
              {(kpis.data?.analogues ?? []).map((match) => (
                <div key={match.wellId} className="stack-list" style={{ gap: 6 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="row row--tight">
                      <Icon name="similarity" size={13} style={{ color: '#a78bfa' }} />
                      <span style={{ fontWeight: 620, fontSize: 13 }}>{match.name}</span>
                      <Chip className="chip chip--neutral chip--sm">{match.distanceKm.toFixed(0)} km</Chip>
                    </span>
                    <span className="mono" style={{ color: '#a78bfa', fontSize: 15 }}>
                      {match.similarity.toFixed(0)}%
                    </span>
                  </div>
                  <MeterRow
                    label={match.formation}
                    value={match.similarity}
                    color="#a78bfa"
                    animated={match.similarity > 90}
                  />
                  <div className="row row--tight t-xs t-mute">
                    <BandChip band={match.riskBand} sm />
                    <span>{match.eventCount} events</span>
                    <span>·</span>
                    <span>{num(match.totalNptHours)} hr NPT</span>
                    <span>·</span>
                    <span>{compact(match.totalNptHours * 4000)} USD lost</span>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </section>

      {/* --------------------------------------------------------- alerts -- */}
      <section>
        <SectionHead
          icon="alerts"
          title={t('dashboard.alertsTitle')}
          hint={`${kpis.data?.alerts.length ?? 0} raising on this well`}
          actions={
            <button type="button" className="btn btn--sm" onClick={() => navigate('/alerts')}>
              {t('nav.alerts')} <Icon name="arrowRight" size={12} />
            </button>
          }
        />
        <div className="stack-list" style={{ marginTop: 12 }}>
          {(kpis.data?.alerts ?? []).slice(0, 3).map((alert) => (
            <article key={alert.id} className={cx('alert-card', `alert-card--${alert.severity.toLowerCase()}`)} style={{ ['--tone' as string]: severityTone(alert.severity) }}>
              <span className="alert-card__icon">
                <Icon name="alerts" size={17} />
              </span>
              <div className="alert-card__body">
                <div className="alert-card__title">
                  <SeverityChip severity={alert.severity} sm />
                  <span>{alert.label} risk</span>
                  <span className="mono" style={{ color: severityTone(alert.severity) }}>
                    {pct(alert.probabilityPct)}
                  </span>
                  <span className="t-xs t-mute">· confidence {pct(alert.confidencePct)}</span>
                </div>
                <div className="alert-card__meta">
                  <span className="mono">{alert.wellName}</span>
                  <span>{alert.formation} · {fmtDepth(alert.depth)}</span>
                  {alert.patternMatch && (
                    <span>
                      pattern: {alert.patternMatch.wellName} {alert.patternMatch.depth.toFixed(0)} m (
                      {timeAgo(alert.patternMatch.date)})
                    </span>
                  )}
                </div>
                <div className="alert-card__action">
                  <Icon name="shield" size={12} style={{ marginRight: 6, verticalAlign: -1 }} />
                  {alert.recommendedAction}
                </div>
              </div>
            </article>
          ))}
          {(kpis.data?.alerts ?? []).length === 0 && !kpis.loading && (
            <div className="banner banner--info">
              <Icon name="check" size={15} />
              No hazard is currently above the alert threshold on this well.
            </div>
          )}
        </div>
      </section>

      {/* -------------------------------------------------------- footer row */}
      <section className="row" style={{ gap: 14, justifyContent: 'space-between' }}>
        <span className="t-xs t-mute">
          {isHindi
            ? 'सभी पूर्वानुमान निकटवर्ती कुओं के ऐतिहासिक रिकॉर्ड पर आधारित हैं।'
            : 'Every prediction above is bound to real offset-well evidence in the corpus.'}
        </span>
        <span className="row row--tight t-xs t-mute">
          <Icon name="database" size={13} />
          {telemetry.data ? `${telemetry.data.history.length} telemetry samples buffered` : '—'}
          <span>·</span>
          <span>{usd(focusWell?.totalCostUsd ?? 0)} historical NPT on this well</span>
        </span>
      </section>
    </div>
  );
}

function iconForKpi(key: string) {
  switch (key) {
    case 'activeDepth':
      return 'target' as const;
    case 'nearbyWells':
      return 'pin' as const;
    case 'similarWells':
      return 'similarity' as const;
    case 'historicalEvents':
      return 'history' as const;
    case 'formationRisks':
      return 'layers' as const;
    case 'activeAlerts':
      return 'alerts' as const;
    case 'predictedIncidents':
      return 'bolt' as const;
    default:
      return 'sparkles' as const;
  }
}

function severityTone(severity: string): string {
  return severity === 'CRITICAL' ? '#ef4444' : severity === 'HIGH' ? '#f97316' : '#f59e0b';
}
