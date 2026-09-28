import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart, Gauge, LineChart } from '../components/charts';
import {
  AsyncBoundary,
  BandChip,
  Chip,
  GlassCard,
  Icon,
  MeterRow,
  Modal,
  OutcomeChip,
  SectionHead,
  Segmented,
  SeverityChip,
  StatusChip,
} from '../components/ui';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { HAZARD_COLOR, HAZARD_SHORT, cx, depth as fmtDepth, num, pct, timeAgo, usd } from '../lib/format';
import { useAsync } from '../lib/hooks';
import type { Hazard } from '../lib/types';
import { useApp } from '../store';

const HAZARDS: Hazard[] = ['MUDFLOSS', 'KICK', 'OVERPRESSURE', 'STUCK_PIPE', 'TORQUE_SPIKE', 'CEMENTING_FAILURE'];

export default function RiskIntelligence() {
  const { t } = useI18n();
  const { focusWellId, focusWell } = useApp();
  const [params, setParams] = useSearchParams();
  const [hazard, setHazard] = useState<Hazard>((params.get('hazard') as Hazard) ?? 'MUDFLOSS');
  const [selectedAnalogue, setSelectedAnalogue] = useState<string | null>(null);
  const focusKey = focusWellId ?? 'auto';

  const risk = useAsync((signal) => api.wellRisk(focusKey, undefined, signal), [focusKey]);
  const profile = useAsync((signal) => api.riskProfile(focusKey, 50, signal), [focusKey]);
  const model = useAsync((signal) => api.model(signal), []);

  const prediction = useMemo(
    () => risk.data?.predictions.find((item) => item.hazard === hazard) ?? null,
    [risk.data, hazard],
  );

  const analogues = risk.data?.sequenceAnalogues[hazard] ?? [];

  return (
    <div className="stack-list" style={{ gap: 18 }}>
      {/* ---------------------------------------------------------- summary */}
      <GlassCard glow>
        <SectionHead
          icon="risk"
          title={t('risk.title')}
          hint={focusWell ? `${focusWell.name} · ${focusWell.field} · ${focusWell.formation} · ${fmtDepth(focusWell.currentDepthMd)}` : undefined}
          actions={
            risk.data && (
              <>
                <Chip className="chip chip--cyan">
                  composite {pct(risk.data.summary.composite)}
                </Chip>
                <BandChip band={risk.data.summary.band} />
              </>
            )
          }
        />
        <AsyncBoundary loading={risk.loading} error={risk.error} onRetry={risk.reload}>
          {risk.data && (
            <>
              <div className="grid grid--3" style={{ marginTop: 14, gap: 12 }}>
                {risk.data.predictions.map((item) => {
                  const active = item.hazard === hazard;
                  return (
                    <button
                      key={item.hazard}
                      type="button"
                      onClick={() => {
                        setHazard(item.hazard);
                        setParams({ hazard: item.hazard }, { replace: true });
                      }}
                      style={{
                        background: active ? 'rgba(34,211,238,.07)' : 'transparent',
                        border: `1px solid ${active ? 'var(--border-glow)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius)',
                        padding: 12,
                        cursor: 'pointer',
                        textAlign: 'center',
                      }}
                    >
                      <Gauge
                        value={item.probabilityPct}
                        confidence={item.confidencePct}
                        color={HAZARD_COLOR[item.hazard]}
                        size={146}
                        caption={HAZARD_SHORT[item.hazard]}
                      />
                      <div className="t-xs t-mute" style={{ marginTop: 2 }}>
                        {fmtDepth(item.depth)} · {item.formation}
                      </div>
                      <div className="row row--tight" style={{ justifyContent: 'center', marginTop: 6 }}>
                        <BandChip band={item.band} sm />
                        <span className="t-xs t-mute">conf {pct(item.confidencePct)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="banner banner--warn" style={{ marginTop: 14 }}>
                <Icon name="bolt" size={15} />
                <span>
                  Dominant hazard <strong>{risk.data.summary.worst.label}</strong> at{' '}
                  {pct(risk.data.summary.worst.probabilityPct)} with {pct(risk.data.summary.worst.confidencePct)}{' '}
                  confidence. Composite drilling risk {pct(risk.data.summary.composite)} ({risk.data.summary.band}).
                </span>
              </div>
            </>
          )}
        </AsyncBoundary>
      </GlassCard>

      {/* ------------------------------------------------- prediction windows */}
      <section>
        <SectionHead
          icon="clock"
          title={t('risk.predictiveWindows')}
          hint="Forecast at the bit, 50 m ahead, 100 m ahead and into the next formation"
        />
        <div className="grid grid--4" style={{ marginTop: 12 }}>
          {risk.data?.windows.map((window) => (
            <GlassCard key={window.key} interactive>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="t-sm" style={{ fontWeight: 640 }}>{window.label}</span>
                <span className="mono t-xs t-mute">{fmtDepth(window.depth)}</span>
              </div>
              <div className="row row--tight" style={{ marginTop: 9 }}>
                <Chip className="chip chip--neutral chip--sm">{window.worst.label}</Chip>
                <BandChip band={window.worst.band} sm />
              </div>
              <div className="stack-list" style={{ marginTop: 11, gap: 7 }}>
                {window.predictions.map((item) => (
                  <MeterRow
                    key={item.hazard}
                    label={HAZARD_SHORT[item.hazard]}
                    value={item.probabilityPct}
                    color={HAZARD_COLOR[item.hazard]}
                  />
                ))}
              </div>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------ explainable AI */}
      <section>
        <SectionHead
          icon="eye"
          title={`${t('risk.explainable')} — ${prediction?.label ?? 'hazard'}`}
          hint={
            model.data
              ? `${model.data.name} v${model.data.version} · ${model.data.structural}`
              : 'Additive feature attributions'
          }
          actions={
            <Segmented
              options={HAZARDS.map((item) => ({ value: item, label: HAZARD_SHORT[item] }))}
              value={hazard}
              onChange={(value) => {
                setHazard(value);
                setParams({ hazard: value }, { replace: true });
              }}
              size="sm"
            />
          }
        />
        <AsyncBoundary loading={risk.loading} error={risk.error} onRetry={risk.reload}>
          {prediction && (
            <div className="grid grid--split" style={{ marginTop: 12, alignItems: 'start' }}>
              <GlassCard>
                <SectionHead
                  icon="analytics"
                  title="Feature attribution"
                  hint="Because the model is linear in its log-odds these contributions are exact, not approximated"
                />
                <div style={{ marginTop: 12 }}>
                  <BarChart
                    horizontal
                    data={prediction.drivers.map((driver) => ({
                      label: driver.label,
                      value: Math.abs(driver.impact),
                      color: driver.impact >= 0 ? '#ef4444' : '#22c55e',
                      hint: `normalised value ${driver.value.toFixed(2)} · weight ${driver.weight} · ${driver.direction} the risk`,
                    }))}
                    height={320}
                    valueFormat={(value) => value.toFixed(2)}
                  />
                </div>
                <div className="divider" style={{ margin: '14px 0' }} />
                <div className="banner banner--info">
                  <Icon name="info" size={15} />
                  <span style={{ lineHeight: 1.65 }}>{prediction.rationale}</span>
                </div>
              </GlassCard>

              <div className="stack-list">
                <GlassCard>
                  <SectionHead icon="gauge" title="Prediction detail" />
                  <div style={{ marginTop: 12 }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="t-sm t-dim">{t('common.probability')}</span>
                      <span className="mono" style={{ color: HAZARD_COLOR[hazard], fontSize: 19 }}>
                        {pct(prediction.probabilityPct, 1)}
                      </span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
                      <span className="t-sm t-dim">{t('common.confidence')}</span>
                      <span className="mono t-sm">{pct(prediction.confidencePct, 1)}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
                      <span className="t-sm t-dim">Band</span>
                      <BandChip band={prediction.band} sm />
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
                      <span className="t-sm t-dim">Evaluated at</span>
                      <span className="mono t-sm">{fmtDepth(prediction.depth)}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
                      <span className="t-sm t-dim">Formation</span>
                      <span className="t-sm">{prediction.formation}</span>
                    </div>
                  </div>
                  <div className="divider" style={{ margin: '13px 0' }} />
                  <div className="stack-list" style={{ gap: 6 }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="t-xs t-mute">Mud weight used</span>
                      <span className="mono t-xs t-dim">{Number(prediction.inputs.mudWeight ?? 0).toFixed(2)} ppg</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="t-xs t-mute">Pore pressure</span>
                      <span className="mono t-xs t-dim">{Number(prediction.inputs.poreEmw ?? 0).toFixed(2)} ppg</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="t-xs t-mute">Fracture gradient</span>
                      <span className="mono t-xs t-dim">{Number(prediction.inputs.fracEmw ?? 0).toFixed(2)} ppg</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="t-xs t-mute">Equivalent circulating density</span>
                      <span className="mono t-xs t-dim">{Number(prediction.inputs.ecd ?? 0).toFixed(2)} ppg</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="t-xs t-mute">Fracture margin</span>
                      <span className="mono t-xs" style={{ color: Number(prediction.inputs.fracMargin ?? 0) < 0.5 ? '#ef4444' : '#22c55e' }}>
                        {Number(prediction.inputs.fracMargin ?? 0).toFixed(2)} ppg
                      </span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="t-xs t-mute">BHT at depth</span>
                      <span className="mono t-xs t-dim">{Number(prediction.inputs.bhtAtDepth ?? 0).toFixed(1)} °C</span>
                    </div>
                  </div>
                </GlassCard>

                <GlassCard>
                  <SectionHead icon="shield" title={t('risk.playbook')} />
                  <ul className="bullets" style={{ marginTop: 10 }}>
                    {prediction.recommendedActions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </GlassCard>
              </div>
            </div>
          )}
        </AsyncBoundary>
      </section>

      {/* -------------------------------------------------------- evidence */}
      <section>
        <SectionHead
          icon="history"
          title={t('risk.supportingIncidents')}
          hint="The real offset-well events the prediction is built on"
        />
        <AsyncBoundary loading={risk.loading} error={risk.error} onRetry={risk.reload}>
          {prediction && (
            <div className="grid grid--split-wide" style={{ marginTop: 12 }}>
              <GlassCard pad={false}>
                <div className="table-wrap" style={{ border: 0, borderRadius: 0, maxHeight: 380 }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Well</th>
                        <th>Formation</th>
                        <th>Depth</th>
                        <th>Offset</th>
                        <th>Severity</th>
                        <th>Date</th>
                        <th>Mitigation &amp; outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prediction.supportingIncidents.map((incident) => (
                        <tr key={incident.id}>
                          <td className="cell-strong nowrap">{incident.wellName}</td>
                          <td className="t-sm t-dim">{incident.formation}</td>
                          <td className="cell-num">{fmtDepth(incident.depth)}</td>
                          <td className="cell-num t-mute">
                            {incident.depthDelta > 0 ? '+' : ''}
                            {incident.depthDelta.toFixed(0)} m
                          </td>
                          <td>
                            <SeverityChip severity={incident.severity} sm />
                          </td>
                          <td className="t-xs t-mute nowrap">{timeAgo(incident.date)}</td>
                          <td>
                            <div className="t-xs">{incident.mitigation}</div>
                            <div style={{ marginTop: 4 }}>
                              <OutcomeChip outcome={incident.outcome} sm />
                            </div>
                          </td>
                        </tr>
                      ))}
                      {prediction.supportingIncidents.length === 0 && (
                        <tr>
                          <td colSpan={7} className="t-sm t-mute">
                            No historical {prediction.label.toLowerCase()} recorded within 180 m of this depth — confidence is
                            reduced accordingly.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </GlassCard>

              <div className="stack-list">
                <GlassCard>
                  <SectionHead icon="pin" title={t('risk.supportingWells')} hint="Offset wells within the evidence window" />
                  <div className="stack-list" style={{ marginTop: 12 }}>
                    {prediction.supportingWells.map((well) => (
                      <button
                        key={well.id}
                        type="button"
                        onClick={() => setSelectedAnalogue(well.id)}
                        className={cx('glass', 'glass--interactive')}
                        style={{ padding: '10px 12px', textAlign: 'left', cursor: 'pointer', border: 0 }}
                      >
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 620, fontSize: 12.8 }}>{well.name}</span>
                          <SeverityChip severity={well.severity} sm />
                        </div>
                        <div className="t-xs t-mute" style={{ marginTop: 4 }}>
                          {well.field} · event at {fmtDepth(well.depth)} · {well.year}
                        </div>
                      </button>
                    ))}
                    {prediction.supportingWells.length === 0 && (
                      <span className="t-sm t-mute">No offset well support in this window.</span>
                    )}
                  </div>
                </GlassCard>

                <GlassCard>
                  <SectionHead icon="similarity" title="Sequence analogues" hint="Wells whose incident sequence most resembles this one" />
                  <div className="stack-list" style={{ marginTop: 12 }}>
                    {analogues.map((row) => (
                      <div key={row.wellId} className="row" style={{ justifyContent: 'space-between' }}>
                        <span>
                          <span style={{ display: 'block', fontSize: 12.6, fontWeight: 600 }}>{row.name}</span>
                          <span className="t-xs t-mute">{row.formation} · {row.events} prior {HAZARD_SHORT[hazard].toLowerCase()} events</span>
                        </span>
                        <span className="mono t-sm" style={{ color: '#a78bfa' }}>{(row.score * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                    {analogues.length === 0 && <span className="t-sm t-mute">No analogue wells found for this hazard.</span>}
                  </div>
                </GlassCard>
              </div>
            </div>
          )}
        </AsyncBoundary>
      </section>

      {/* -------------------------------------------------- depth heat profile */}
      <section>
        <SectionHead icon="layers" title="Risk heatmap along depth" hint="All six hazards against measured depth" />
        <GlassCard style={{ marginTop: 12 }}>
          <AsyncBoundary loading={profile.loading} error={profile.error} onRetry={profile.reload}>
            {profile.data && (
              <>
                <LineChart
                  series={HAZARDS.map((item) => ({
                    key: item,
                    label: HAZARD_SHORT[item],
                    color: HAZARD_COLOR[item],
                    values: profile.data!.samples.map((row) => Number(row[item] ?? 0)),
                    area: false,
                    width: item === hazard ? 2.8 : 1.6,
                    dashed: item !== hazard,
                  }))}
                  xLabels={profile.data.samples.map((row) => String(row.depth))}
                  height={280}
                  yMax={100}
                  yUnit="risk %"
                  xTitle="measured depth (m)"
                  refLines={[
                    { value: 78, label: 'critical', color: '#ef4444' },
                    { value: 58, label: 'high', color: '#f97316' },
                    { value: 34, label: 'moderate', color: '#f59e0b' },
                  ]}
                />
                <div className="divider" style={{ margin: '16px 0' }} />
                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  {profile.data.bands
                    .filter((band) => band.band === 'CRITICAL' || band.band === 'HIGH')
                    .slice(0, 10)
                    .map((band) => (
                      <span
                        key={band.depth}
                        className={cx('chip', band.band === 'CRITICAL' ? 'chip--critical' : 'chip--high')}
                        style={{ textTransform: 'none', letterSpacing: 0, fontSize: 11 }}
                        title={Object.entries(band.hazards)
                          .map(([key, value]) => `${HAZARD_SHORT[key as Hazard]}: ${value}%`)
                          .join('  ')}
                      >
                        {band.depth.toFixed(0)}–{(band.depth + 100).toFixed(0)} m · {band.formation} · {band.weighted.toFixed(0)}%
                      </span>
                    ))}
                  {profile.data.bands.every((band) => band.band !== 'CRITICAL' && band.band !== 'HIGH') && (
                    <span className="t-sm" style={{ color: '#22c55e' }}>
                      No high or critical depth bands in the planned hole section.
                    </span>
                  )}
                </div>
              </>
            )}
          </AsyncBoundary>
        </GlassCard>
      </section>

      {/* ------------------------------------------------------------ model */}
      <section>
        <SectionHead icon="cpu" title={t('risk.modelCard')} hint={model.data?.trainingCorpus} />
        <AsyncBoundary loading={model.loading} error={model.error} onRetry={model.reload}>
          {model.data && (
            <div className="grid grid--split" style={{ marginTop: 12 }}>
              <GlassCard>
                <SectionHead icon="analytics" title={t('risk.featureImportance')} hint="Mean absolute weight across all six hazard models" />
                <div style={{ marginTop: 12 }}>
                  <BarChart
                    horizontal
                    data={model.data.featureImportance.map((row) => ({
                      label: row.label,
                      value: row.importance,
                      color: '#22d3ee',
                      hint: `relative importance ${row.importancePct}%`,
                    }))}
                    height={300}
                    valueFormat={(value) => value.toFixed(2)}
                  />
                </div>
              </GlassCard>

              <div className="stack-list">
                <GlassCard>
                  <SectionHead icon="info" title="Model card" />
                  <div className="stack-list" style={{ marginTop: 12, gap: 10 }}>
                    {[
                      ['Name', model.data.name],
                      ['Version', model.data.version],
                      ['Estimator', model.data.structural],
                      ['Corpus', model.data.trainingCorpus],
                      ['Calibration', model.data.calibration],
                      ['Serving', model.data.serving],
                      ['Alert threshold', `${model.data.alertThreshold.toFixed(0)}%`],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <div className="t-label" style={{ fontSize: 9.6 }}>{label}</div>
                        <div className="t-sm t-dim">{value}</div>
                      </div>
                    ))}
                  </div>
                </GlassCard>

                <GlassCard>
                  <SectionHead icon="book" title="Hazard rationales" />
                  <div className="stack-list" style={{ marginTop: 12 }}>
                    {model.data.hazards.map((item) => (
                      <div key={item.hazard}>
                        <div className="row row--tight">
                          <span className="dot" style={{ background: HAZARD_COLOR[item.hazard], color: HAZARD_COLOR[item.hazard] }} />
                          <span className="t-sm" style={{ fontWeight: 620 }}>{item.label}</span>
                        </div>
                        <div className="t-xs t-mute" style={{ marginTop: 3, lineHeight: 1.6 }}>{item.rationale}</div>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              </div>
            </div>
          )}
        </AsyncBoundary>
      </section>

      <OffsetWellModal wellId={selectedAnalogue} onClose={() => setSelectedAnalogue(null)} />
    </div>
  );
}

/** Compact offset-well record, opened from the supporting-wells list. */
function OffsetWellModal({ wellId, onClose }: { wellId: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const well = useAsync((signal) => (wellId ? api.well(wellId, signal) : Promise.resolve(null)), [wellId]);
  const data = well.data;

  return (
    <Modal
      open={Boolean(wellId)}
      onClose={onClose}
      title={data?.name ?? 'Offset well'}
      subtitle={data ? `${data.operator} · ${data.field} · ${data.basin} basin` : 'Loading…'}
      actions={data && <StatusChip status={data.status} />}
    >
      <AsyncBoundary loading={well.loading} error={well.error} onRetry={well.reload}>
        {data && (
          <>
            <div className="grid grid--4" style={{ gap: 10 }}>
              {[
                ['Well ID', data.id],
                ['Formation', data.formation],
                ['Total depth', fmtDepth(data.totalDepthMd)],
                ['Mud weight', `${data.mudWeight.toFixed(2)} ppg`],
                ['Events', `${data.eventCount} (${data.criticalEventCount} critical)`],
                ['Offset risk', pct(data.riskScore)],
                ['Total NPT', `${num(data.totalNptHours)} hr`],
                ['NPT cost', usd(data.totalCostUsd)],
              ].map(([label, value]) => (
                <div key={label} className="glass" style={{ padding: '9px 11px' }}>
                  <div className="t-label" style={{ fontSize: 9.6 }}>{label}</div>
                  <div className="mono t-sm">{value}</div>
                </div>
              ))}
            </div>

            <GlassCard>
              <SectionHead icon="history" title="Recorded events" hint={`${data.events.length} on record`} />
              <div className="stack-list" style={{ marginTop: 12, maxHeight: 320, overflowY: 'auto' }}>
                {data.events.map((event) => (
                  <div key={event.id} className="glass" style={{ padding: '9px 11px' }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="row row--tight">
                        <SeverityChip severity={event.severity} sm />
                        <span className="t-sm" style={{ fontWeight: 620 }}>{event.label}</span>
                      </span>
                      <span className="mono t-xs t-mute">{fmtDepth(event.depth)}</span>
                    </div>
                    <div className="t-xs t-dim" style={{ marginTop: 5 }}>{event.formation} · {timeAgo(event.date)}</div>
                    <div className="t-xs t-mute" style={{ marginTop: 5 }}>{event.mitigation}</div>
                    <div className="row row--tight" style={{ marginTop: 7 }}>
                      <OutcomeChip outcome={event.outcome} sm />
                      <span className="t-xs t-mute">{num(event.nptHours)} hr NPT</span>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard>
              <SectionHead icon="book" title={t('common.lessons')} />
              <ul className="bullets" style={{ marginTop: 10 }}>
                {data.lessonsLearned.slice(0, 6).map((lesson) => (
                  <li key={`${lesson.eventType}-${lesson.depth}`}>
                    <span className="t-xs" style={{ color: HAZARD_COLOR[lesson.eventType] }}>
                      {fmtDepth(lesson.depth)} {lesson.formation}:
                    </span>{' '}
                    {lesson.text}
                  </li>
                ))}
              </ul>
            </GlassCard>
          </>
        )}
      </AsyncBoundary>
    </Modal>
  );
}
