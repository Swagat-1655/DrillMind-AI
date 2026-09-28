import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart } from '../components/charts';
import {
  AsyncBoundary,
  BandChip,
  Chip,
  GlassCard,
  Icon,
  KeyValue,
  SectionHead,
  SeverityChip,
  Skeleton,
  StatusChip,
} from '../components/ui';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import {
  HAZARD_COLOR,
  compact,
  depth as fmtDepth,
  formatDateTime,
  num,
  pct,
  scoreColor,
  usd,
} from '../lib/format';
import { useAsync } from '../lib/hooks';
import { useApp } from '../store';

const SECTIONS = [
  'Active Well Summary',
  'AI Executive Summary',
  'Forward Hazard Predictions',
  'Prediction Windows',
  'Formation Risk Analysis',
  'Nearby Wells Analysis',
  'Similar Wells',
  'High-Risk Depth Bands',
  'Recommendations',
  'Institutional Memory',
  'Supporting Evidence',
];

export default function ReportsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { focusWellId, focusWell, pushToast } = useApp();
  const focusKey = focusWellId ?? 'auto';

  const [includeNarrative, setIncludeNarrative] = useState(true);
  const [requested, setRequested] = useState(false);

  const report = useAsync(
    (signal) => (requested ? api.report(focusKey, { narrative: includeNarrative }, signal) : Promise.resolve(null)),
    [focusKey, includeNarrative, requested],
  );

  const data = report.data;

  const generate = () => {
    setRequested(true);
    report.reload();
    pushToast({
      tone: 'info',
      title: 'Building the intelligence report',
      detail: 'Collating offset wells, formations and predictions…',
    });
  };

  const downloadDocx = () => {
    if (!focusWell) return;
    window.open(api.reportDocxUrl(focusWell.id), '_blank');
    pushToast({ tone: 'success', title: 'DOCX download started', detail: `${focusWell.name} intelligence report` });
  };

  const openPrintView = () => {
    if (!focusWell) return;
    window.open(api.reportHtmlUrl(focusWell.id), '_blank');
    pushToast({ tone: 'info', title: 'Print view opened', detail: 'Use Print / Save as PDF in the new tab' });
  };

  return (
    <div className="stack-list" style={{ gap: 18 }}>
      {/* --------------------------------------------------------- generator */}
      <GlassCard glow>
        <SectionHead
          icon="reports"
          title={t('reports.title')}
          hint={
            focusWell
              ? `${focusWell.name} · ${focusWell.field} · ${focusWell.basin} basin · ${focusWell.operator}`
              : t('reports.subtitle')
          }
          actions={
            <>
              {focusWell && <StatusChip status={focusWell.status} />}
              {focusWell && <BandChip band={focusWell.riskBand} />}
            </>
          }
        />

        <div className="grid grid--split" style={{ marginTop: 16, alignItems: 'start' }}>
          <div className="stack-list">
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn--primary btn--lg" onClick={generate} disabled={report.loading}>
                {report.loading ? <span className="spinner" /> : <Icon name="sparkles" size={16} />}
                {t('reports.generate')}
              </button>
              <button type="button" className="btn btn--accent" onClick={openPrintView} disabled={!focusWell}>
                <Icon name="file" size={15} /> {t('reports.pdf')}
              </button>
              <button type="button" className="btn" onClick={downloadDocx} disabled={!focusWell}>
                <Icon name="download" size={15} /> {t('reports.docx')}
              </button>
            </div>

            <label className="row" style={{ gap: 9, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={includeNarrative}
                onChange={(event) => setIncludeNarrative(event.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#22d3ee' }}
              />
              <span className="t-sm">{t('reports.narrative')}</span>
              <span className="t-xs t-mute">
                — generated with the LLM copilot over the same retrieval index; adds 3–10 s and needs the Groq key
              </span>
            </label>

            <div className="banner banner--info">
              <Icon name="info" size={15} />
              <span style={{ lineHeight: 1.65 }}>
                The DOCX is a native OOXML package generated server-side. The PDF button opens a print-optimised sheet —
                use your browser&rsquo;s <strong>Print → Save as PDF</strong> to produce the PDF deliverable with correct A4
                page breaks.
              </span>
            </div>

            <GlassCard>
              <SectionHead icon="book" title={t('reports.sections')} hint="Every report always contains these" />
              <div className="grid grid--2" style={{ marginTop: 12, gap: 6 }}>
                {SECTIONS.map((section, index) => (
                  <div key={section} className="row row--tight t-sm t-dim">
                    <span className="mono t-xs t-mute" style={{ width: 18 }}>{index + 1}.</span>
                    {section}
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

          <div className="stack-list">
            <GlassCard>
              <SectionHead icon="target" title="Report subject" />
              <div style={{ marginTop: 12 }}>
                <KeyValue
                  rows={[
                    { label: 'Well', value: focusWell?.name ?? '—' },
                    { label: 'Well ID', value: focusWell?.id ?? '—' },
                    { label: 'Operator', value: focusWell?.operator ?? '—' },
                    { label: 'Basin', value: focusWell?.basin ?? '—' },
                    { label: 'Formation', value: focusWell?.formation ?? '—' },
                    { label: 'Depth', value: focusWell ? fmtDepth(focusWell.currentDepthMd) : '—' },
                    { label: 'Offset risk', value: focusWell ? `${focusWell.riskScore.toFixed(0)} (${focusWell.riskBand})` : '—' },
                    { label: 'Events', value: focusWell ? String(focusWell.eventCount) : '—' },
                  ]}
                />
              </div>
              <div className="divider" style={{ margin: '13px 0' }} />
              <button type="button" className="btn btn--sm btn--ghost btn--block" onClick={() => navigate('/dashboard')}>
                <Icon name="dashboard" size={12} /> Change the focus well from the navbar
              </button>
            </GlassCard>

            {data && (
              <GlassCard>
                <SectionHead icon="check" title="Report ready" hint={data.reportId} />
                <div style={{ marginTop: 12 }}>
                  <KeyValue
                    rows={[
                      { label: 'Generated', value: formatDateTime(data.generatedAt) },
                      { label: 'Prepared by', value: data.preparedBy },
                      { label: 'Offset events used', value: num(data.totals.nearbyEvents) },
                      { label: 'Offset NPT', value: `${num(data.totals.nearbyNptHours)} hr` },
                      { label: 'Analogue NPT', value: `${num(data.totals.analogueNptHours)} hr` },
                      { label: 'Composite risk', value: pct(data.risk.composite) },
                    ]}
                  />
                </div>
              </GlassCard>
            )}
          </div>
        </div>
      </GlassCard>

      {/* --------------------------------------------------------- preview */}
      {!requested && (
        <GlassCard>
          <div className="empty">
            <Icon name="file" size={24} />
            <div style={{ fontWeight: 620, color: 'var(--text-dim)' }}>
              Press &ldquo;{t('reports.generate')}&rdquo; to build the report
            </div>
            <div className="t-xs">
              It pulls the live hazard ensemble, the offset-well analysis, formation intelligence and the supporting
              evidence base for the selected well.
            </div>
          </div>
        </GlassCard>
      )}

      {requested && (
        <AsyncBoundary loading={report.loading} error={report.error} onRetry={report.reload} skeletonRows={8}>
          {data && (
            <>
              <GlassCard>
                <SectionHead
                  icon="reports"
                  title="1 · Active well summary"
                  hint={`${data.well.name} · ${data.well.field} · ${data.well.basin} basin`}
                />
                <div className="grid grid--4" style={{ marginTop: 14, gap: 10 }}>
                  {[
                    ['Well ID', data.well.id],
                    ['Operator', data.well.operator],
                    ['Status', data.well.status],
                    ['Spud', data.well.spudDate],
                    ['Current depth', fmtDepth(data.well.currentDepthMd)],
                    ['Total depth', fmtDepth(data.well.totalDepthMd)],
                    ['Formation', data.well.formation],
                    ['Reservoir', data.well.reservoir],
                    ['Mud weight', `${data.well.mudWeight.toFixed(2)} ppg`],
                    ['Pore pressure', `${data.well.poreEmw.toFixed(2)} ppg eq`],
                    ['Fracture gradient', `${data.well.fracEmw.toFixed(2)} ppg eq`],
                    ['Bottom-hole temp', `${data.well.bottomHoleTempC.toFixed(1)} °C`],
                  ].map(([label, value]) => (
                    <div key={label} className="glass" style={{ padding: '9px 11px' }}>
                      <div className="t-label" style={{ fontSize: 9.5 }}>{label}</div>
                      <div className="mono t-sm">{String(value)}</div>
                    </div>
                  ))}
                </div>
              </GlassCard>

              {data.narrative && (
                <GlassCard>
                  <SectionHead icon="sparkles" title="2 · AI executive summary" hint="Generated by the DrillMind copilot" />
                  <div style={{ marginTop: 12 }} className="stack-list">
                    {data.narrative.split(/\n{2,}/).map((paragraph, index) => (
                      <p key={index} className="t-sm t-dim" style={{ lineHeight: 1.78 }}>
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </GlassCard>
              )}

              <div className="grid grid--2">
                <GlassCard>
                  <SectionHead icon="risk" title="3 · Forward hazard predictions" />
                  <div style={{ marginTop: 12 }}>
                    <BarChart
                      horizontal
                      data={data.predictedRisks.map((row) => ({
                        label: row.label,
                        value: row.probabilityPct,
                        color: HAZARD_COLOR[row.hazard],
                        hint: `confidence ${pct(row.confidencePct)} · band ${row.band} · driver: ${row.topDriver?.label ?? '—'}`,
                      }))}
                      height={190}
                      valueFormat={(value) => `${value.toFixed(0)}%`}
                    />
                  </div>
                </GlassCard>

                <GlassCard>
                  <SectionHead icon="clock" title="4 · Prediction windows" />
                  <div className="stack-list" style={{ marginTop: 12 }}>
                    {data.windows.map((window) => (
                      <div key={window.key} className="glass" style={{ padding: '10px 12px' }}>
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <span className="t-sm" style={{ fontWeight: 620 }}>{window.label}</span>
                          <span className="mono t-xs t-mute">{fmtDepth(window.depth)}</span>
                        </div>
                        <div className="row row--tight" style={{ marginTop: 7 }}>
                          <Chip className="chip chip--neutral chip--sm">{window.worst.label}</Chip>
                          <span className="mono t-xs" style={{ color: HAZARD_COLOR[window.worst.hazard] }}>
                            {pct(window.worst.probabilityPct)}
                          </span>
                          <BandChip band={window.worst.band} sm />
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              </div>

              <GlassCard pad={false}>
                <div style={{ padding: '16px 18px 8px' }}>
                  <SectionHead icon="formation" title="5 · Formation risk analysis" hint="Pore, fracture and the hazard window to watch" />
                </div>
                <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Formation</th>
                        <th>Interval</th>
                        <th>Pore</th>
                        <th>Frac</th>
                        <th>Primary hazard</th>
                        <th>Hazard window</th>
                        <th>Events</th>
                        <th>Intel.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.formations.map((row) => (
                        <tr key={row.name}>
                          <td className="cell-strong">{row.name}</td>
                          <td className="cell-num t-mute">{row.interval}</td>
                          <td className="cell-num">{row.poreEmw.toFixed(2)}</td>
                          <td className="cell-num">{row.fracEmw.toFixed(2)}</td>
                          <td className="t-sm t-dim">{row.primaryHazard}</td>
                          <td className="cell-num t-dim">{row.window}</td>
                          <td className="cell-num">{row.events}</td>
                          <td className="cell-num" style={{ color: scoreColor(row.intelligence) }}>
                            {row.intelligence.toFixed(0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>

              <div className="grid grid--2">
                <GlassCard pad={false}>
                  <div style={{ padding: '16px 18px 8px' }}>
                    <SectionHead icon="pin" title="6 · Nearby wells analysis" hint={`${data.nearbyWells.length} offsets inside 15 km`} />
                  </div>
                  <div className="table-wrap" style={{ border: 0, borderRadius: 0, maxHeight: 330 }}>
                    <table className="data" style={{ minWidth: 480 }}>
                      <thead>
                        <tr>
                          <th>Well</th>
                          <th>Distance</th>
                          <th>Status</th>
                          <th>Events</th>
                          <th>Risk</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.nearbyWells.map((row) => (
                          <tr key={row.id}>
                            <td className="cell-strong nowrap">{row.name}</td>
                            <td className="cell-num">{row.distanceKm.toFixed(1)} km</td>
                            <td>
                              <StatusChip status={row.status} sm />
                            </td>
                            <td className="cell-num">{row.eventCount}</td>
                            <td className="cell-num" style={{ color: scoreColor(row.riskScore) }}>
                              {row.riskScore.toFixed(0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </GlassCard>

                <GlassCard pad={false}>
                  <div style={{ padding: '16px 18px 8px' }}>
                    <SectionHead icon="similarity" title="7 · Similar wells" hint="AI Similarity Engine output" />
                  </div>
                  <div className="table-wrap" style={{ border: 0, borderRadius: 0, maxHeight: 330 }}>
                    <table className="data" style={{ minWidth: 460 }}>
                      <thead>
                        <tr>
                          <th>Well</th>
                          <th>Similarity</th>
                          <th>Distance</th>
                          <th>Critical</th>
                          <th>NPT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.similarWells.map((row) => (
                          <tr key={row.wellId}>
                            <td className="cell-strong nowrap">{row.name}</td>
                            <td className="cell-num" style={{ color: '#a78bfa' }}>{row.similarity.toFixed(0)}%</td>
                            <td className="cell-num">{row.distanceKm.toFixed(1)} km</td>
                            <td className="cell-num" style={{ color: '#ef4444' }}>{row.criticalEventCount}</td>
                            <td className="cell-num">{num(row.totalNptHours)} hr</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </GlassCard>
              </div>

              <div className="grid grid--2">
                <GlassCard>
                  <SectionHead icon="layers" title="8 · High-risk depth bands" />
                  <div className="stack-list" style={{ marginTop: 12 }}>
                    {data.criticalBands.map((band) => (
                      <div key={band.depth} className="row" style={{ justifyContent: 'space-between' }}>
                        <span className="mono t-sm">
                          {band.depth.toFixed(0)}–{(band.depth + 100).toFixed(0)} m
                        </span>
                        <span className="t-xs t-mute">{band.formation}</span>
                        <span className="row row--tight">
                          <BandChip band={band.band} sm />
                          <span className="mono t-xs">{band.weighted.toFixed(0)}%</span>
                        </span>
                      </div>
                    ))}
                    {data.criticalBands.length === 0 && (
                      <span className="t-sm" style={{ color: '#22c55e' }}>
                        No high or critical bands ahead — the programme is currently on the safe side of the window.
                      </span>
                    )}
                  </div>
                </GlassCard>

                <GlassCard>
                  <SectionHead icon="shield" title="9 · Recommendations" />
                  <ul className="bullets" style={{ marginTop: 10 }}>
                    {data.recommendations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </GlassCard>
              </div>

              <GlassCard>
                <SectionHead
                  icon="memory"
                  title="10 · Institutional memory"
                  hint={`${data.memory.score.toFixed(0)} / 100 · ${data.memory.grade}`}
                />
                <p className="t-sm t-dim" style={{ marginTop: 12, lineHeight: 1.75 }}>{data.memory.narrative}</p>
                <div className="grid grid--3" style={{ marginTop: 14, gap: 10 }}>
                  {data.memory.metrics.map((metric) => (
                    <div key={metric.key} className="glass" style={{ padding: '10px 12px' }}>
                      <div className="t-label" style={{ fontSize: 9.5 }}>{metric.label}</div>
                      <div className="mono" style={{ fontSize: 18, color: '#22d3ee' }}>
                        {typeof metric.value === 'number' && metric.value % 1 !== 0 ? metric.value.toFixed(1) : num(metric.value)}
                      </div>
                      <div className="t-xs t-mute">{metric.unit}</div>
                    </div>
                  ))}
                </div>
              </GlassCard>

              <GlassCard pad={false}>
                <div style={{ padding: '16px 18px 8px' }}>
                  <SectionHead icon="history" title="11 · Supporting evidence" hint="The incidents behind every claim above" />
                </div>
                <div className="table-wrap" style={{ border: 0, borderRadius: 0, maxHeight: 380 }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Well</th>
                        <th>Event</th>
                        <th>Formation</th>
                        <th>Depth</th>
                        <th>Severity</th>
                        <th>Mitigation</th>
                        <th>Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.evidence.map((row) => (
                        <tr key={row.id}>
                          <td className="t-xs t-mute nowrap">{row.date}</td>
                          <td className="cell-strong nowrap">{row.wellName}</td>
                          <td className="t-sm">{row.label}</td>
                          <td className="t-sm t-dim">{row.formation}</td>
                          <td className="cell-num">{fmtDepth(row.depth)}</td>
                          <td>
                            <SeverityChip severity={row.severity} sm />
                          </td>
                          <td className="t-xs t-dim" style={{ maxWidth: 320 }}>{row.mitigation}</td>
                          <td className="t-xs">{row.outcome}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>

              <GlassCard>
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <span className="t-xs t-mute">
                    Report {data.reportId} · {formatDateTime(data.generatedAt)} · {compact(data.totals.nearbyEvents)} offset
                    events referenced · total well NPT cost {usd(focusWell?.totalCostUsd ?? 0, 1)}
                  </span>
                  <span className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn btn--sm" onClick={openPrintView}>
                      <Icon name="file" size={12} /> {t('reports.pdf')}
                    </button>
                    <button type="button" className="btn btn--sm btn--primary" onClick={downloadDocx}>
                      <Icon name="download" size={12} /> {t('reports.docx')}
                    </button>
                  </span>
                </div>
              </GlassCard>
            </>
          )}
        </AsyncBoundary>
      )}

      {report.loading && !data && (
        <div className="stack-list">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} height={120} />
          ))}
        </div>
      )}
    </div>
  );
}
