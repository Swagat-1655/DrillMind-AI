import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart } from '../components/charts';
import {
  AsyncBoundary,
  BandChip,
  Chip,
  GlassCard,
  Icon,
  MeterRow,
  OutcomeChip,
  SectionHead,
  Segmented,
  SeverityChip,
  Skeleton,
} from '../components/ui';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { HAZARD_COLOR, HAZARD_SHORT, compact, cx, depth as fmtDepth, num, pct } from '../lib/format';
import { useAsync, usePolling } from '../lib/hooks';
import type { Hazard, Severity } from '../lib/types';
import { useApp } from '../store';

const SEVERITY_TONE: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#f59e0b',
};

export default function AlertsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { setFocusWellId, setAlertCounts } = useApp();
  const [severity, setSeverity] = useState<'all' | Severity>('all');
  const [hazard, setHazard] = useState<'all' | Hazard>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const alerts = useAsync(
    (signal) =>
      api.alerts(
        {
          severity: severity === 'all' ? undefined : severity,
          hazard: hazard === 'all' ? undefined : hazard,
          limit: 90,
        },
        signal,
      ),
    [severity, hazard],
  );

  usePolling(() => alerts.reload(), 30_000);

  // Keep the navbar badge honest.
  const fleet = useAsync((signal) => api.alerts({ limit: 1 }, signal), []);
  useEffect(() => {
    if (!fleet.data) return;
    setAlertCounts({
      critical: fleet.data.counts.CRITICAL ?? 0,
      high: fleet.data.counts.HIGH ?? 0,
      medium: fleet.data.counts.MEDIUM ?? 0,
    });
  }, [fleet.data, setAlertCounts]);

  const rows = alerts.data?.alerts ?? [];

  const hazardBreakdown = useMemo(() => {
    const counts = new Map<Hazard, number>();
    for (const alert of rows) counts.set(alert.hazard, (counts.get(alert.hazard) ?? 0) + 1);
    return [...counts.entries()].map(([key, value]) => ({
      label: HAZARD_SHORT[key],
      value,
      color: HAZARD_COLOR[key],
    }));
  }, [rows]);

  return (
    <div className="stack-list" style={{ gap: 18 }}>
      {/* ---------------------------------------------------------- summary */}
      <GlassCard glow>
        <SectionHead
          icon="alerts"
          title={t('alerts.title')}
          hint={t('alerts.subtitle')}
          actions={
            <>
              <Chip className="chip chip--critical">
                <Icon name="bolt" size={11} /> {alerts.data?.counts.CRITICAL ?? 0} {t('alerts.critical')}
              </Chip>
              <Chip className="chip chip--high">
                {alerts.data?.counts.HIGH ?? 0} {t('alerts.high')}
              </Chip>
              <Chip className="chip chip--moderate">
                {alerts.data?.counts.MEDIUM ?? 0} {t('alerts.medium')}
              </Chip>
              <button type="button" className="btn btn--sm btn--ghost" onClick={alerts.reload}>
                <Icon name="refresh" size={12} /> {t('common.refresh')}
              </button>
            </>
          }
        />

        <div className="grid grid--split-wide" style={{ marginTop: 14, alignItems: 'start' }}>
          <div className="stack-list">
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <Segmented
                options={[
                  { value: 'all', label: t('common.all') },
                  { value: 'CRITICAL', label: t('alerts.critical') },
                  { value: 'HIGH', label: t('alerts.high') },
                  { value: 'MEDIUM', label: t('alerts.medium') },
                ]}
                value={severity}
                onChange={setSeverity}
                size="sm"
              />
              <Segmented
                options={[
                  { value: 'all', label: 'Any hazard' },
                  ...(['MUDFLOSS', 'KICK', 'OVERPRESSURE', 'STUCK_PIPE', 'TORQUE_SPIKE', 'CEMENTING_FAILURE'] as Hazard[]).map(
                    (item) => ({ value: item, label: HAZARD_SHORT[item] }),
                  ),
                ]}
                value={hazard}
                onChange={setHazard}
                size="sm"
              />
            </div>
            <div className="banner banner--info">
              <Icon name="info" size={15} />
              <span>
                Alerts are raised whenever a hazard probability at the bit crosses{' '}
                <strong className="mono">{alerts.data ? alerts.data.threshold.toFixed(0) : 46}%</strong>. Confidence is
                driven by how many offset-well incidences support the prediction.
              </span>
            </div>
          </div>

          <GlassCard>
            <SectionHead icon="chart" title="Alerts by hazard" hint={`${rows.length} in the current filter`} />
            <div style={{ marginTop: 10 }}>
              <BarChart
                horizontal
                data={hazardBreakdown}
                height={170}
                valueFormat={(value) => `${value}`}
              />
            </div>
            <div className="divider" style={{ margin: '12px 0' }} />
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="t-xs t-mute">Wells affected</span>
              <span className="mono t-sm">{num(new Set(rows.map((row) => row.wellId)).size)}</span>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="t-xs t-mute">Expected NPT at risk</span>
              <span className="mono t-sm" style={{ color: '#ef4444' }}>
                {compact(rows.reduce((sum, row) => sum + row.probabilityPct / 100 * 14, 0))} hr
              </span>
            </div>
          </GlassCard>
        </div>
      </GlassCard>

      {/* -------------------------------------------------------- alert feed */}
      <section>
        <SectionHead
          icon="bolt"
          title="Alert feed"
          hint="Ranked by severity, then by probability. Click an alert to open the full evidence chain."
        />

        <div className="stack-list" style={{ marginTop: 12 }}>
          <AsyncBoundary loading={alerts.loading} error={alerts.error} onRetry={alerts.reload} skeletonRows={6}>
            {rows.slice(0, 40).map((alert) => {
              const tone = SEVERITY_TONE[alert.severity] ?? '#f59e0b';
              const isOpen = expanded === alert.id;
              return (
                <article
                  key={alert.id}
                  className={cx('alert-card', `alert-card--${alert.severity.toLowerCase()}`)}
                  style={{ ['--tone' as string]: tone, cursor: 'pointer' }}
                  onClick={() => setExpanded(isOpen ? null : alert.id)}
                >
                  <span className="alert-card__icon">
                    <Icon name={alert.hazard === 'KICK' ? 'flame' : alert.hazard === 'MUDFLOSS' ? 'droplet' : 'alerts'} size={17} />
                  </span>
                  <div className="alert-card__body">
                    <div className="alert-card__title">
                      <SeverityChip severity={alert.severity} />
                      <span style={{ fontWeight: 660 }}>⚠ {alert.label} risk</span>
                      <span className="mono" style={{ color: tone, fontSize: 15 }}>
                        {pct(alert.probabilityPct, 1)}
                      </span>
                      <BandChip band={alert.band} sm />
                      <span className="t-xs t-mute">confidence {pct(alert.confidencePct)}</span>
                    </div>

                    <div className="alert-card__meta">
                      <span className="row row--tight">
                        <Icon name="pin" size={11} />
                        <strong className="mono">{alert.wellName}</strong>
                      </span>
                      <span>{alert.operator} · {alert.field} · {alert.basin}</span>
                      <span>
                        {alert.formation} · <span className="mono">{fmtDepth(alert.depth)}</span>
                      </span>
                    </div>

                    {alert.patternMatch && (
                      <div className="glass" style={{ padding: '9px 11px' }}>
                        <div className="t-label" style={{ fontSize: 9.4 }}>{t('alerts.patternMatch')}</div>
                        <div className="t-sm" style={{ marginTop: 4 }}>
                          Current depth <strong className="mono">{fmtDepth(alert.depth)}</strong> · nearby well{' '}
                          <strong>{alert.patternMatch.wellName}</strong> recorded {alert.label.toLowerCase()} at{' '}
                          <strong className="mono">{fmtDepth(alert.patternMatch.depth)}</strong>{' '}
                          <span className="t-mute">
                            ({alert.patternMatch.depthDelta > 0 ? '+' : ''}
                            {alert.patternMatch.depthDelta.toFixed(0)} m offset, {alert.patternMatch.date})
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="alert-card__action">
                      <div className="t-label" style={{ fontSize: 9.4, marginBottom: 3 }}>
                        {t('alerts.recommendedAction')}
                      </div>
                      {alert.recommendedAction}
                    </div>

                    {isOpen && (
                      <div className="stack-list" style={{ marginTop: 6 }}>
                        <div className="grid grid--2" style={{ gap: 12 }}>
                          <div>
                            <span className="t-label">Why this alert fired</span>
                            <div className="stack-list" style={{ marginTop: 8, gap: 7 }}>
                              {alert.drivers.slice(0, 5).map((driver) => (
                                <MeterRow
                                  key={driver.feature}
                                  label={driver.label}
                                  value={Math.abs(driver.impact)}
                                  max={1.2}
                                  color={driver.impact >= 0 ? '#ef4444' : '#22c55e'}
                                  suffix=""
                                />
                              ))}
                            </div>
                            <div className="t-xs t-mute" style={{ marginTop: 8 }}>
                              green bars reduce the risk, red bars increase it. Contribution is weighted by the normalised
                              feature value.
                            </div>
                          </div>
                          <div>
                            <span className="t-label">{t('risk.playbook')}</span>
                            <ul className="bullets" style={{ marginTop: 8 }}>
                              {alert.playbook.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        {alert.supportingIncidents.length > 0 && (
                          <>
                            <div className="divider" />
                            <span className="t-label">Supporting historical incidents</span>
                            <div className="stack-list" style={{ marginTop: 8 }}>
                              {alert.supportingIncidents.map((incident) => (
                                <div key={incident.id} className="row" style={{ justifyContent: 'space-between' }}>
                                  <span className="row row--tight">
                                    <SeverityChip severity={incident.severity} sm />
                                    <span className="t-sm">{incident.wellName}</span>
                                    <span className="t-xs t-mute">{incident.formation} · {fmtDepth(incident.depth)}</span>
                                  </span>
                                  <span className="row row--tight">
                                    <span className="t-xs t-mute">{num(incident.nptHours)} hr NPT</span>
                                    <OutcomeChip outcome={incident.outcome} sm />
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        {alert.analogues.length > 0 && (
                          <>
                            <div className="divider" />
                            <span className="t-label">Sequence analogues</span>
                            <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                              {alert.analogues.map((analogue) => (
                                <span key={analogue.wellId} className="chip chip--violet" style={{ textTransform: 'none', letterSpacing: 0 }}>
                                  {analogue.name} · {(analogue.score * 100).toFixed(0)}% · {analogue.events} events
                                </span>
                              ))}
                            </div>
                          </>
                        )}

                        <div className="row" style={{ gap: 8, marginTop: 8 }}>
                          <button
                            type="button"
                            className="btn btn--sm btn--primary"
                            onClick={(event) => {
                              event.stopPropagation();
                              setFocusWellId(alert.wellId);
                              navigate('/risk');
                            }}
                          >
                            <Icon name="risk" size={12} /> {t('alerts.openWell')}
                          </button>
                          <button
                            type="button"
                            className="btn btn--sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              setFocusWellId(alert.wellId);
                              navigate('/map');
                            }}
                          >
                            <Icon name="map" size={12} /> {t('nav.map')}
                          </button>
                          <button
                            type="button"
                            className="btn btn--sm btn--ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              setFocusWellId(alert.wellId);
                              navigate('/whatif');
                            }}
                          >
                            <Icon name="whatif" size={12} /> {t('nav.whatif')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
            {!alerts.loading && rows.length === 0 && (
              <div className="banner banner--info">
                <Icon name="check" size={15} />
                No hazard is currently above the alert threshold across the fleet.
              </div>
            )}
            {alerts.loading &&
              Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} height={92} />)}
          </AsyncBoundary>
        </div>
      </section>
    </div>
  );
}
