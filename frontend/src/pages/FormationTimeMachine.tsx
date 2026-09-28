import { useEffect, useMemo, useState } from 'react';
import { BarChart, Donut, LineChart, ScoreRing, StackedBarChart } from '../components/charts';
import {
  AsyncBoundary,
  BandChip,
  Chip,
  GlassCard,
  Icon,
  MeterRow,
  SectionHead,
  SearchInput,
  Segmented,
  SeverityChip,
  Skeleton,
} from '../components/ui';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { HAZARD_COLOR, HAZARD_SHORT, compact, cx, depth as fmtDepth, num, pct, scoreColor, usd } from '../lib/format';
import { useAsync, useDebounced } from '../lib/hooks';
import type { Hazard } from '../lib/types';
import { useApp } from '../store';

const HAZARD_KEYS: Hazard[] = ['MUDFLOSS', 'KICK', 'OVERPRESSURE', 'TORQUE_SPIKE', 'STUCK_PIPE', 'CEMENTING_FAILURE'];

export default function FormationTimeMachine() {
  const { t, isHindi } = useI18n();
  const { focusWell, setFocusWellId } = useApp();
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query);
  const [basin, setBasin] = useState<'all' | string>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const [activeHazard, setActiveHazard] = useState<Hazard>('MUDFLOSS');

  const list = useAsync((signal) => api.formations({ q: debounced || undefined }, signal), [debounced]);

  const records = useMemo(() => {
    const rows = list.data?.formations ?? [];
    return basin === 'all' ? rows : rows.filter((row) => row.basin === basin);
  }, [list.data, basin]);

  const detail = useAsync(
    (signal) => (selected ? api.formation(selected, signal) : Promise.resolve(null)),
    [selected],
  );

  useEffect(() => {
    if (selected) return;
    if (focusWell) {
      setSelected(focusWell.formation);
      return;
    }
    if (records.length > 0) setSelected(records[0].name);
  }, [records, selected, focusWell]);

  const worst = useMemo(() => {
    if (!records.length) return null;
    return [...records].sort((a, b) => b.hazardRate - a.hazardRate)[0];
  }, [records]);

  const histogram = detail.data?.depthHistogram ?? [];

  return (
    <div className="stack-list" style={{ gap: 18 }}>
      {/* ------------------------------------------------------- selector rail */}
      <div className="grid grid--split-wide" style={{ alignItems: 'start' }}>
        <GlassCard pad={false}>
          <div style={{ padding: '16px 18px 10px' }}>
            <SectionHead
              icon="history"
              title={t('formation.title')}
              hint={`${records.length} formations with recorded intersections`}
              actions={
                <SearchInput value={query} onChange={setQuery} placeholder="Filter formations…" width={190} />
              }
            />
            <div className="row" style={{ gap: 7, marginTop: 12 }}>
              <Segmented
                options={[
                  { value: 'all', label: t('common.all') },
                  { value: 'Assam-Arakan', label: 'Assam-Arakan' },
                  { value: 'Cambay', label: 'Cambay' },
                  { value: 'Krishna-Godavari', label: 'KG' },
                ]}
                value={basin}
                onChange={setBasin}
                size="sm"
              />
            </div>
          </div>

          <div className="scroll-y" style={{ maxHeight: 520, padding: '4px 12px 14px' }}>
            {list.loading && (
              <div className="stack-list" style={{ padding: '6px 6px' }}>
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} height={44} />
                ))}
              </div>
            )}
            {records.map((record) => {
              const isActive = record.name === selected;
              return (
                <button
                  key={record.name}
                  type="button"
                  onClick={() => setSelected(record.name)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1fr) 62px',
                    gap: 10,
                    alignItems: 'center',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    marginBottom: 5,
                    borderRadius: 12,
                    border: `1px solid ${isActive ? 'var(--border-glow)' : 'transparent'}`,
                    background: isActive ? 'rgba(34,211,238,.1)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span className="row row--tight">
                      <span style={{ fontWeight: 630, fontSize: 13 }}>{record.name}</span>
                      <BandChip band={record.riskBand} sm />
                    </span>
                    <span className="t-xs t-mute" style={{ display: 'block', marginTop: 2 }}>
                      {record.basin} · {record.wellCount} wells · {record.eventCount} events
                    </span>
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <span className="mono" style={{ fontSize: 15, color: scoreColor(record.intelligenceScore) }}>
                      {record.intelligenceScore.toFixed(0)}
                    </span>
                    <span className="t-xs t-mute" style={{ display: 'block' }}>intel</span>
                  </span>
                </button>
              );
            })}
            {!list.loading && records.length === 0 && (
              <div className="empty">No formation matches that filter.</div>
            )}
          </div>
        </GlassCard>

        {/* -------------------------------------------------------- overview */}
        <div className="stack-list">
          <GlassCard glow>
            <SectionHead icon="sparkles" title={t('landing.statsTitle')} hint="Corpus-wide" />
            <div className="grid grid--4" style={{ marginTop: 14, gap: 10 }}>
              {[
                ['Formations', num(records.length), '#22d3ee'],
                ['Wells penetrated', num(records.reduce((sum, row) => sum + row.wellCount, 0)), '#3b82f6'],
                ['Events on record', num(records.reduce((sum, row) => sum + row.eventCount, 0)), '#f97316'],
                ['NPT hours', compact(records.reduce((sum, row) => sum + row.totalNptHours, 0)), '#ef4444'],
              ].map(([label, value, color]) => (
                <div key={label} className="glass" style={{ padding: '10px 12px' }}>
                  <div className="t-label" style={{ fontSize: 9.6 }}>{label}</div>
                  <div className="mono" style={{ fontSize: 18, color }}>{value}</div>
                </div>
              ))}
            </div>
            {worst && (
              <div className="banner banner--warn" style={{ marginTop: 14 }}>
                <Icon name="alerts" size={15} />
                <span>
                  Highest hazard rate:{' '}
                  <strong>{worst.name}</strong> at {pct(worst.hazardRate)} per well, dominated by{' '}
                  {worst.primaryHazard?.label ?? '—'} around {worst.primaryHazard ? fmtDepth(worst.primaryHazard.median) : '—'}.
                </span>
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      {/* --------------------------------------------------------- detail */}
      <AsyncBoundary loading={detail.loading} error={detail.error} onRetry={detail.reload}>
        {detail.data && (
          <>
            <GlassCard glow>
              <SectionHead
                icon="formation"
                title={detail.data.name}
                hint={`${detail.data.basin} basin · ${detail.data.lithology}`}
                actions={
                  <>
                    <BandChip band={detail.data.riskBand} />
                    <Chip className="chip chip--cyan">
                      <Icon name="pin" size={11} /> {detail.data.wellCount} wells
                    </Chip>
                    <Chip className="chip chip--moderate">
                      <Icon name="bolt" size={11} /> {detail.data.eventCount} events
                    </Chip>
                  </>
                }
              />

              <div className="grid grid--split" style={{ marginTop: 16, alignItems: 'start' }}>
                <div className="stack-list">
                  <div className="banner banner--info" style={{ alignItems: 'flex-start' }}>
                    <Icon name="sparkles" size={15} style={{ marginTop: 2 }} />
                    <span style={{ lineHeight: 1.68 }}>{detail.data.summary}</span>
                  </div>

                  <div className="grid grid--4" style={{ gap: 10 }}>
                    {[
                      ['Depth range', detail.data.depthRange[0] ? `${detail.data.depthRange[0]}–${detail.data.depthRange[1]} m` : '—'],
                      ['Pore pressure', detail.data.poreEmw ? `${detail.data.poreEmw.toFixed(2)} ppg` : '—'],
                      ['Fracture gradient', detail.data.fracEmw ? `${detail.data.fracEmw.toFixed(2)} ppg` : '—'],
                      ['Reservoir', detail.data.reservoir || '—'],
                      ['Porosity', detail.data.porosity ? `${(detail.data.porosity * 100).toFixed(1)}%` : '—'],
                      ['Permeability', detail.data.permMd ? `${num(detail.data.permMd)} mD` : '—'],
                      ['Hazard rate', `${detail.data.hazardRate.toFixed(1)} / well`],
                      ['NPT cost', usd(detail.data.totalCostUsd)],
                    ].map(([label, value]) => (
                      <div key={label} className="glass" style={{ padding: '9px 11px' }}>
                        <div className="t-label" style={{ fontSize: 9.6 }}>{label}</div>
                        <div className="mono t-sm">{value}</div>
                      </div>
                    ))}
                  </div>

                  <GlassCard>
                    <SectionHead
                      icon="target"
                      title={t('formation.hazardWindows')}
                      hint="Where each hazard was actually recorded (18th–82nd percentile band)"
                      actions={
                        <Segmented
                          options={HAZARD_KEYS.slice(0, 4).map((hazard) => ({ value: hazard, label: HAZARD_SHORT[hazard] }))}
                          value={activeHazard}
                          onChange={setActiveHazard}
                          size="sm"
                        />
                      }
                    />
                    <div className="stack-list" style={{ marginTop: 14 }}>
                      {detail.data.windows.map((window) => (
                        <div key={window.hazard} className="stack-list" style={{ gap: 6 }}>
                          <div className="row" style={{ justifyContent: 'space-between' }}>
                            <span className="row row--tight">
                              <span className="dot" style={{ background: HAZARD_COLOR[window.hazard], color: HAZARD_COLOR[window.hazard] }} />
                              <span className="t-sm" style={{ fontWeight: 620 }}>{window.label}</span>
                              <span className="t-xs t-mute">{window.count} events · {pct(window.share)} of all</span>
                            </span>
                            <span className="mono t-sm" style={{ color: HAZARD_COLOR[window.hazard] }}>
                              {window.low.toFixed(0)}–{window.high.toFixed(0)} m
                            </span>
                          </div>
                          <MeterRow
                            label={`median ${window.median.toFixed(0)} m`}
                            value={window.count}
                            max={Math.max(1, detail.data!.eventCount)}
                            color={HAZARD_COLOR[window.hazard]}
                            suffix=""
                          />
                        </div>
                      ))}
                      {detail.data.windows.length === 0 && <span className="t-sm t-mute">No hazard events recorded here yet.</span>}
                    </div>
                  </GlassCard>

                  <GlassCard>
                    <SectionHead
                      icon="shield"
                      title={t('formation.bestMitigation')}
                      hint="Ranked by success rate weighted by how often it was actually tried"
                    />
                    <div className="stack-list" style={{ marginTop: 14 }}>
                      {detail.data.mitigations.slice(0, 6).map((mitigation, index) => (
                        <div key={`${mitigation.eventType}-${mitigation.strategy}`} className="glass" style={{ padding: '11px 13px' }}>
                          <div className="row" style={{ justifyContent: 'space-between' }}>
                            <span className="row row--tight">
                              <span
                                className="mono"
                                style={{ color: index === 0 ? '#22c55e' : 'var(--text-mute)', fontWeight: 700, fontSize: 13 }}
                              >
                                #{index + 1}
                              </span>
                              <Chip className="chip chip--neutral chip--sm" title={mitigation.label}>
                                {HAZARD_SHORT[mitigation.eventType]}
                              </Chip>
                            </span>
                            <span className="row row--tight">
                              <span className="mono t-sm" style={{ color: '#22c55e' }}>{pct(mitigation.successRate)}</span>
                              <span className="t-xs t-mute">{mitigation.attempts} attempts</span>
                            </span>
                          </div>
                          <div className="t-sm" style={{ marginTop: 7 }}>{mitigation.strategy}</div>
                          <div className="row row--tight" style={{ marginTop: 8 }}>
                            <MeterRow
                              label="success"
                              value={mitigation.successRate}
                              color="#22c55e"
                            />
                          </div>
                          <div className="t-xs t-mute" style={{ marginTop: 5 }}>
                            average {mitigation.avgNpt.toFixed(1)} hr of non-productive time per attempt
                          </div>
                        </div>
                      ))}
                    </div>
                  </GlassCard>
                </div>

                <div className="stack-list">
                  <GlassCard>
                    <div className="row" style={{ justifyContent: 'center' }}>
                      <ScoreRing
                        value={detail.data.intelligenceScore}
                        color={scoreColor(detail.data.intelligenceScore)}
                        label={t('formation.intelligence')}
                        sub={`${detail.data.wellCount} wells · ${detail.data.eventCount} events`}
                        size={168}
                      />
                    </div>
                    <div className="divider" style={{ margin: '14px 0' }} />
                    <span className="t-label">Severity mix</span>
                    <div style={{ marginTop: 10 }}>
                      <Donut
                        size={140}
                        data={[
                          { label: 'Critical', value: detail.data.severityMix.CRITICAL ?? 0, color: '#ef4444' },
                          { label: 'High', value: detail.data.severityMix.HIGH ?? 0, color: '#f97316' },
                          { label: 'Medium', value: detail.data.severityMix.MEDIUM ?? 0, color: '#f59e0b' },
                          { label: 'Low', value: detail.data.severityMix.LOW ?? 0, color: '#22c55e' },
                        ]}
                        center={
                          <span className="mono" style={{ fontSize: 17 }}>
                            {detail.data.eventCount}
                          </span>
                        }
                      />
                    </div>
                  </GlassCard>

                  <GlassCard>
                    <SectionHead icon="analytics" title={t('formation.timeline')} hint="Events per year" />
                    <div style={{ marginTop: 12 }}>
                      <BarChart
                        data={detail.data.timeline.map((row) => ({ label: String(row.year), value: row.events }))}
                        height={190}
                        color="#22d3ee"
                        xTitle="year"
                        yTitle="events"
                      />
                    </div>
                  </GlassCard>

                  <GlassCard>
                    <SectionHead
                      icon="layers"
                      title={t('formation.depthProfile')}
                      hint="Stacked event counts per 100 m"
                    />
                    <div style={{ marginTop: 12 }}>
                      <StackedBarChart
                        rows={histogram.slice(-16).map((row) => ({ ...row, label: String(row.depth) }))}
                        keys={HAZARD_KEYS.map((hazard) => ({
                          key: hazard,
                          label: HAZARD_SHORT[hazard],
                          color: HAZARD_COLOR[hazard],
                        }))}
                        height={230}
                        xTitle="depth (m)"
                      />
                    </div>
                  </GlassCard>
                </div>
              </div>
            </GlassCard>

            {/* ------------------------------------------------- offset wells */}
            <div className="grid grid--split-wide">
              <GlassCard pad={false}>
                <div style={{ padding: '16px 18px 8px' }}>
                  <SectionHead
                    icon="pin"
                    title={t('formation.pastWells')}
                    hint={`Every offset well that penetrated ${detail.data.name}`}
                  />
                </div>
                <div className="table-wrap" style={{ border: 0, borderRadius: 0, maxHeight: 380 }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Well</th>
                        <th>Operator</th>
                        <th>Year</th>
                        <th>Depth</th>
                        <th>Events here</th>
                        <th>Worst event</th>
                        <th>Risk</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.data.analogueWells ?? []).map((well) => (
                        <tr key={well.id} className="clickable" onClick={() => setFocusWellId(well.id)}>
                          <td className="cell-strong nowrap">{well.name}</td>
                          <td className="t-sm t-dim">{well.operator}</td>
                          <td className="cell-num">{well.year}</td>
                          <td className="cell-num">{fmtDepth(well.depth)}</td>
                          <td className="cell-num">{well.eventCount}</td>
                          <td>
                            {well.worstEvent ? (
                              <span className="row row--tight">
                                <SeverityChip severity={well.worstEvent.severity} sm />
                                <span className="t-xs">{well.worstEvent.label}</span>
                              </span>
                            ) : (
                              <span className="t-xs t-mute">clean</span>
                            )}
                          </td>
                          <td>
                            <span className="mono t-xs" style={{ color: scoreColor(well.riskScore) }}>
                              {well.riskScore.toFixed(0)}
                            </span>
                          </td>
                          <td>
                            <Icon name="chevronRight" size={13} className="t-mute" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>

              <GlassCard>
                <SectionHead icon="chart" title="Hazard composition" hint="Share of every event type recorded here" />
                <div style={{ marginTop: 12 }}>
                  <BarChart
                    horizontal
                    data={HAZARD_KEYS.map((hazard) => ({
                      label: HAZARD_SHORT[hazard],
                      value: detail.data!.hazardCounts[hazard] ?? 0,
                      color: HAZARD_COLOR[hazard],
                      hint: `${detail.data!.hazardRates[hazard]?.toFixed(1) ?? 0}% of events`,
                    }))}
                    height={190}
                    valueFormat={(value) => `${value}`}
                  />
                </div>
                <div className="divider" style={{ margin: '12px 0' }} />
                <SectionHead icon="info" title="Formation note" />
                <p className="t-sm t-dim" style={{ marginTop: 8, lineHeight: 1.68 }}>{detail.data.headline}</p>
              </GlassCard>
            </div>

            {/* -------------------------------------------------- depth line */}
            <GlassCard>
              <SectionHead
                icon="activity"
                title="Hazard density along measured depth"
                hint="Every recorded event in this formation, binned"
              />
              <div style={{ marginTop: 12 }}>
                <LineChart
                  series={HAZARD_KEYS.map((hazard) => ({
                    key: hazard,
                    label: HAZARD_SHORT[hazard],
                    color: HAZARD_COLOR[hazard],
                    values: histogram.map((row) => Number(row[hazard] ?? 0)),
                    dashed: hazard !== activeHazard,
                    width: hazard === activeHazard ? 2.6 : 1.5,
                    area: false,
                  }))}
                  xLabels={histogram.map((row) => String(row.depth))}
                  height={230}
                  xTitle="measured depth (m)"
                  yTitle="events"
                />
              </div>
              <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <span className="t-xs t-mute">
                  {isHindi
                    ? 'गहराई के साथ जोखिम का वितरण दिखाता है कि अगली बार कहाँ सतर्क रहना है।'
                    : 'The band with the tallest bar is where the next well should be most careful.'}
                </span>
              </div>
            </GlassCard>
          </>
        )}
      </AsyncBoundary>

      {!detail.loading && !detail.data && (
        <div className={cx('empty')}>
          <Icon name="formation" size={22} />
          Select a formation to open its intelligence record.
        </div>
      )}
    </div>
  );
}
