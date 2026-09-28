import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Donut, LineChart, StackedBarChart } from '../components/charts';
import { BandChip, Chip, GlassCard, Icon, SectionHead, Segmented, StatusChip } from '../components/ui';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { HAZARD_COLOR, HAZARD_SHORT, compact, cx, num, pct, scoreColor, usd } from '../lib/format';
import { useAsync } from '../lib/hooks';
import type { Hazard } from '../lib/types';
import { useApp } from '../store';

const HAZARD_KEYS: Hazard[] = [
  'MUDFLOSS',
  'STUCK_PIPE',
  'TORQUE_SPIKE',
  'KICK',
  'OVERPRESSURE',
  'CEMENTING_FAILURE',
  'BIT_DAMAGE',
];

export default function AnalyticsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { setFocusWellId } = useApp();
  const [metric, setMetric] = useState<'events' | 'nptHours' | 'costUsd'>('events');
  const [topN, setTopN] = useState(8);

  const analytics = useAsync((signal) => api.analytics(signal), []);

  const data = analytics.data;

  return (
    <div className="stack-list" style={{ gap: 18 }}>
      {/* ------------------------------------------------------------- totals */}
      <GlassCard glow>
        <SectionHead
          icon="analytics"
          title={t('analytics.title')}
          hint={t('analytics.subtitle')}
          actions={
            <>
              <Chip className="chip chip--cyan">{num(data?.totals.totalWells ?? 0)} wells</Chip>
              <Chip className="chip chip--orange">{num(data?.totals.eventsAnalyzed ?? 0)} events</Chip>
              <Chip className="chip chip--red">{num(data?.totals.criticalEvents ?? 0)} critical</Chip>
              <Segmented
                options={[
                  { value: 'events', label: 'Events' },
                  { value: 'nptHours', label: 'NPT hours' },
                  { value: 'costUsd', label: 'Cost' },
                ]}
                value={metric}
                onChange={setMetric}
                size="sm"
              />
            </>
          }
        />
        <div className="grid grid--4" style={{ marginTop: 14, gap: 10 }}>
          {[
            ['Wells on record', num(data?.totals.totalWells ?? 0), '#22d3ee'],
            ['Events analysed', num(data?.totals.eventsAnalyzed ?? 0), '#f97316'],
            ['Rig days lost', num(data?.totals.rigDaysLost ?? 0), '#ef4444'],
            ['NPT cost', usd(data?.totals.totalCostUsd ?? 0, 1), '#a78bfa'],
            ['Avg NPT / event', `${num(data?.totals.avgNptPerEvent ?? 0)} hr`, '#f59e0b'],
            ['Mitigation success', pct(data?.totals.successRate ?? 0), '#22c55e'],
            ['Formation records', num(data?.totals.formationRecords ?? 0), '#3b82f6'],
            ['Basins covered', num(data?.totals.basins ?? 0), '#ec4899'],
          ].map(([label, value, color]) => (
            <div key={label} className="glass" style={{ padding: '11px 13px' }}>
              <div className="t-label" style={{ fontSize: 9.5 }}>{label}</div>
              <div className="mono" style={{ fontSize: 20, color }}>{value}</div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* --------------------------------------------------- hazard frequency */}
      <section>
        <SectionHead
          icon="chart"
          title={t('analytics.hazardFrequency')}
          hint="Every hazard type with its share, NPT and cost footprint"
        />
        <div className="grid grid--split" style={{ marginTop: 12 }}>
          <GlassCard>
            <div style={{ marginTop: 4 }}>
              <BarChart
                horizontal
                data={(data?.hazardFrequency ?? []).map((row) => ({
                  label: row.label,
                  value: metric === 'events' ? row.count : metric === 'nptHours' ? row.nptHours : row.costUsd,
                  color: HAZARD_COLOR[row.hazard],
                  hint: `${row.count} events · ${num(row.nptHours)} hr NPT · ${usd(row.costUsd)} · avg depth ${num(row.avgDepth)} m`,
                }))}
                height={280}
                valueFormat={(value) => (metric === 'events' ? `${value}` : metric === 'nptHours' ? `${num(value)} hr` : usd(value, 1))}
              />
            </div>
          </GlassCard>

          <GlassCard pad={false}>
            <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
              <table className="data" style={{ minWidth: 420 }}>
                <thead>
                  <tr>
                    <th>Hazard</th>
                    <th>Events</th>
                    <th>Share</th>
                    <th>Critical</th>
                    <th>NPT</th>
                    <th>Cost</th>
                    <th>Avg depth</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.hazardFrequency ?? []).map((row) => (
                    <tr key={row.hazard}>
                      <td>
                        <span className="row row--tight">
                          <span className="dot" style={{ background: HAZARD_COLOR[row.hazard], color: HAZARD_COLOR[row.hazard] }} />
                          <span className="cell-strong">{HAZARD_SHORT[row.hazard]}</span>
                        </span>
                      </td>
                      <td className="cell-num">{row.count}</td>
                      <td className="cell-num">{pct(row.share)}</td>
                      <td className="cell-num" style={{ color: '#ef4444' }}>{row.criticalCount}</td>
                      <td className="cell-num">{num(row.nptHours)}</td>
                      <td className="cell-num">{usd(row.costUsd, 1)}</td>
                      <td className="cell-num t-mute">{num(row.avgDepth)} m</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      </section>

      {/* -------------------------------------------------- formation analysis */}
      <section>
        <SectionHead
          icon="formation"
          title={t('analytics.byFormation')}
          hint="Stacked incident counts — the brown/red mass is where the money went"
          actions={
            <Segmented
              options={[
                { value: '8', label: 'Top 8' },
                { value: '12', label: 'Top 12' },
                { value: '16', label: 'Top 16' },
              ]}
              value={String(topN)}
              onChange={(value) => setTopN(Number(value))}
              size="sm"
            />
          }
        />
        <div className="grid grid--split-wide" style={{ marginTop: 12 }}>
          <GlassCard>
            <StackedBarChart
              rows={(data?.incidentsByFormation ?? []).slice(0, topN).map((row) => ({
                ...row,
                label: row.formation.replace(/ (Sandstone|Shale|Formation|Clay|Complex|Limestone)$/, ''),
              }))}
              keys={HAZARD_KEYS.map((hazard) => ({
                key: hazard,
                label: HAZARD_SHORT[hazard],
                color: HAZARD_COLOR[hazard],
              }))}
              height={320}
              xTitle="formation"
            />
          </GlassCard>

          <GlassCard pad={false}>
            <div style={{ padding: '16px 18px 8px' }}>
              <SectionHead icon="risk" title={t('analytics.ranking')} hint="Ranked by recorded incident volume" />
            </div>
            <div className="table-wrap" style={{ border: 0, borderRadius: 0, maxHeight: 330 }}>
              <table className="data" style={{ minWidth: 420 }}>
                <thead>
                  <tr>
                    <th>Formation</th>
                    <th>Events</th>
                    <th>Wells</th>
                    <th>Primary hazard</th>
                    <th>Window</th>
                    <th>Intel.</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.formationRiskRanking ?? []).slice(0, 15).map((row) => (
                    <tr key={row.formation} className="clickable" onClick={() => navigate('/formation')}>
                      <td className="cell-strong">{row.formation}</td>
                      <td className="cell-num">{row.eventCount}</td>
                      <td className="cell-num t-mute">{row.wellCount}</td>
                      <td className="t-sm t-dim">{row.primaryHazardLabel ?? '—'}</td>
                      <td className="cell-num t-mute">{row.window ? `${num(row.window)} m` : '—'}</td>
                      <td>
                        <span className="row row--tight">
                          <span className="mono t-xs" style={{ color: scoreColor(row.intelligenceScore) }}>
                            {row.intelligenceScore.toFixed(0)}
                          </span>
                          <BandChip band={row.band} sm />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      </section>

      {/* ------------------------------------------------------- time series */}
      <section>
        <div className="grid grid--2">
          <GlassCard>
            <SectionHead
              icon="history"
              title={t('analytics.byYear')}
              hint="Events and non-productive time by calendar year"
            />
            <div style={{ marginTop: 12 }}>
              <LineChart
                series={[
                  { key: 'events', label: 'Events', color: '#f97316', values: (data?.eventsByYear ?? []).map((row) => row.events) },
                  { key: 'npt', label: 'NPT hours (÷10)', color: '#22d3ee', values: (data?.eventsByYear ?? []).map((row) => row.nptHours / 10), area: false },
                ]}
                xLabels={(data?.eventsByYear ?? []).map((row) => String(row.year))}
                height={226}
                xTitle="year"
              />
            </div>
          </GlassCard>

          <GlassCard>
            <SectionHead icon="layers" title={t('analytics.depthDistribution')} hint="Where in the hole things actually go wrong" />
            <div style={{ marginTop: 12 }}>
              <StackedBarChart
                rows={(data?.depthDistribution ?? []).map((row) => ({ ...row, label: String(row.depth) }))}
                keys={HAZARD_KEYS.map((hazard) => ({
                  key: hazard,
                  label: HAZARD_SHORT[hazard],
                  color: HAZARD_COLOR[hazard],
                }))}
                height={226}
                xTitle="depth (m)"
              />
            </div>
          </GlassCard>
        </div>
      </section>

      {/* ------------------------------------------------------ success rates */}
      <section>
        <div className="grid grid--3">
          <GlassCard>
            <SectionHead icon="shield" title={t('analytics.successRate')} hint="Across all recorded interventions" />
            <div style={{ marginTop: 12 }}>
              <Donut
                size={158}
                data={(data?.successRate ?? []).map((row) => ({
                  label: row.name,
                  value: row.value,
                  color: row.name === 'SUCCESS' ? '#22c55e' : row.name === 'PARTIAL' ? '#f59e0b' : '#ef4444',
                }))}
                center={
                  <span className="mono" style={{ fontSize: 17 }}>
                    {pct(data?.totals.successRate ?? 0)}
                  </span>
                }
              />
            </div>
          </GlassCard>

          <GlassCard>
            <SectionHead icon="bolt" title={t('analytics.npt')} hint="Severity mix of every recorded event" />
            <div style={{ marginTop: 12 }}>
              <Donut
                size={158}
                data={(data?.severityMix ?? []).map((row) => ({
                  label: row.name,
                  value: row.value,
                  color: row.name === 'CRITICAL' ? '#ef4444' : row.name === 'HIGH' ? '#f97316' : row.name === 'MEDIUM' ? '#f59e0b' : '#22c55e',
                }))}
                center={
                  <span className="mono" style={{ fontSize: 17 }}>
                    {num((data?.severityMix ?? []).reduce((sum, row) => sum + row.value, 0))}
                  </span>
                }
              />
            </div>
          </GlassCard>

          <GlassCard>
            <SectionHead icon="chart" title="Basin comparison" hint="Incident volume by basin" />
            <div style={{ marginTop: 12 }}>
              <BarChart
                horizontal
                data={(data?.basinMix ?? []).map((row) => ({
                  label: row.basin,
                  value: row.total,
                  color: row.basin === 'Assam-Arakan' ? '#22d3ee' : row.basin === 'Cambay' ? '#a78bfa' : '#f59e0b',
                }))}
                height={150}
                valueFormat={(value) => `${value}`}
              />
            </div>
            <div className="divider" style={{ margin: '12px 0' }} />
            <div className="stack-list" style={{ gap: 6 }}>
              {(data?.formationSuccess ?? []).slice(0, 6).map((row) => (
                <div key={row.formation} className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="t-xs t-mute nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>
                    {row.formation}
                  </span>
                  <span className="row row--tight">
                    <span className="mono t-xs" style={{ color: '#22c55e' }}>{pct(row.successRate)}</span>
                    <span className="t-xs t-mute">{row.attempts} tries</span>
                  </span>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </section>

      {/* ---------------------------------------------------------- hot wells */}
      <section>
        <SectionHead
          icon="alerts"
          title="Highest-risk wells on record"
          hint="Offset risk score combines pressure window tightness, hazard pressure and real incident load"
        />
        <GlassCard pad={false} style={{ marginTop: 12 }}>
          <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Well</th>
                  <th>Field</th>
                  <th>Basin</th>
                  <th>Status</th>
                  <th>Events</th>
                  <th>NPT</th>
                  <th>Cost</th>
                  <th>Risk</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(data?.topRiskWells ?? []).map((well) => (
                  <tr
                    key={well.id}
                    className="clickable"
                    onClick={() => {
                      setFocusWellId(well.id);
                      navigate('/dashboard');
                    }}
                  >
                    <td className="cell-strong nowrap">{well.name}</td>
                    <td className="t-sm t-dim">{well.field}</td>
                    <td className="t-sm t-dim">{well.basin}</td>
                    <td>
                      <StatusChip status={well.status} sm />
                    </td>
                    <td className="cell-num">{well.eventCount}</td>
                    <td className="cell-num">{num(well.totalNptHours)} hr</td>
                    <td className="cell-num">{usd(well.totalCostUsd, 1)}</td>
                    <td>
                      <span className="row row--tight">
                        <span className="meter" style={{ width: 54, height: 6 }}>
                          <span className="meter__fill" style={{ width: `${well.riskScore}%`, background: scoreColor(well.riskScore) }} />
                        </span>
                        <span className="mono t-xs" style={{ color: scoreColor(well.riskScore) }}>
                          {well.riskScore.toFixed(0)}
                        </span>
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

        <div className="row" style={{ marginTop: 12, gap: 14, flexWrap: 'wrap' }}>
          <span className="t-xs t-mute">
            Total recorded non-productive time{' '}
            <strong className="mono" style={{ color: '#ef4444' }}>{compact(data?.totals.totalNptHours ?? 0)} hr</strong> —{' '}
            {num(data?.totals.rigDaysLost ?? 0)} rig days, {usd(data?.totals.totalCostUsd ?? 0, 1)}.
          </span>
          <span className="spacer" />
          <button type="button" className={cx('btn', 'btn--sm', 'btn--ghost')} onClick={() => navigate('/reports')}>
            <Icon name="reports" size={12} /> {t('nav.reports')}
          </button>
        </div>
      </section>
    </div>
  );
}
