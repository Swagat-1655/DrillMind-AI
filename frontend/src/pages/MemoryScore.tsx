import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Donut, ScoreRing } from '../components/charts';
import {
  AsyncBoundary,
  BandChip,
  Chip,
  GlassCard,
  Icon,
  SectionHead,
  SeverityChip,
  StatusChip,
} from '../components/ui';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { HAZARD_COLOR, HAZARD_SHORT, cx, depth as fmtDepth, num, pct, scoreColor, timeAgo } from '../lib/format';
import { useAsync } from '../lib/hooks';
import type { Hazard } from '../lib/types';
import { useApp } from '../store';

export default function MemoryScore() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { focusWellId, focusWell } = useApp();
  const focusKey = focusWellId ?? 'auto';
  const [selected, setSelected] = useState<string | null>(null);

  const memory = useAsync((signal) => api.memory(focusKey, signal), [focusKey]);

  return (
    <div className="stack-list" style={{ gap: 18 }}>
      {/* ---------------------------------------------------------- headline */}
      <GlassCard glow>
        <SectionHead
          icon="memory"
          title={t('memory.title')}
          hint={
            focusWell
              ? `${focusWell.name} · ${focusWell.field} · ${focusWell.formation}`
              : t('memory.subtitle')
          }
          actions={
            memory.data && (
              <>
                <Chip className="chip chip--cyan">{memory.data.grade}</Chip>
                {focusWell && <StatusChip status={focusWell.status} />}
                <BandChip band={focusWell?.riskBand ?? 'MODERATE'} />
              </>
            )
          }
        />

        <div className="grid grid--split" style={{ marginTop: 16, alignItems: 'start' }}>
          <div className="stack-list">
            <div className="banner banner--info" style={{ alignItems: 'flex-start' }}>
              <Icon name="sparkles" size={15} style={{ marginTop: 2 }} />
              <span style={{ lineHeight: 1.7 }}>{memory.data?.narrative ?? t('common.loading')}</span>
            </div>

            <div className="grid grid--3" style={{ gap: 10 }}>
              {(memory.data?.metrics ?? []).map((metric) => (
                <div key={metric.key} className="glass" style={{ padding: '11px 13px' }}>
                  <div className="t-label" style={{ fontSize: 9.5 }}>{metric.label}</div>
                  <div className="mono" style={{ fontSize: 22, color: memoryTone(metric.tone) }}>
                    {typeof metric.value === 'number' && metric.value % 1 !== 0
                      ? metric.value.toFixed(1)
                      : num(metric.value)}
                  </div>
                  <div className="t-xs t-mute">{metric.unit}</div>
                </div>
              ))}
            </div>

            <GlassCard>
              <SectionHead
                icon="analytics"
                title={t('memory.breakdown')}
                hint="How the score is composed, and the maximum each component can contribute"
              />
              <div style={{ marginTop: 12 }}>
                <BarChart
                  horizontal
                  data={(memory.data?.breakdown ?? []).map((row) => ({
                    label: row.component,
                    value: row.contribution,
                    color: scoreColor((row.contribution / row.max) * 100),
                    hint: `${row.contribution.toFixed(1)} of a possible ${row.max} points`,
                  }))}
                  height={170}
                  valueFormat={(value) => value.toFixed(1)}
                />
              </div>
              <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <span className="t-xs t-mute">
                  Offset volume carries the most weight: a decision is only as good as the number of wells that have
                  already tested it.
                </span>
              </div>
            </GlassCard>
          </div>

          <div className="stack-list">
            <GlassCard>
              <div className="row" style={{ justifyContent: 'center' }}>
                <ScoreRing
                  value={memory.data?.score ?? 0}
                  color={scoreColor(memory.data?.score ?? 0)}
                  label={t('memory.title')}
                  sub={memory.data?.grade}
                  size={186}
                  thickness={15}
                />
              </div>
              <div className="divider" style={{ margin: '16px 0' }} />
              <div className="stack-list" style={{ gap: 8 }}>
                {(memory.data?.metrics ?? []).map((metric) => (
                  <div key={metric.key} className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="t-sm t-dim">{metric.label}</span>
                    <span className="mono t-sm" style={{ color: memoryTone(metric.tone) }}>
                      {typeof metric.value === 'number' && metric.value % 1 !== 0 ? metric.value.toFixed(1) : num(metric.value)}
                    </span>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard>
              <SectionHead icon="risk" title={t('memory.byHazard')} hint="Predictions backed by real incidents" />
              <div style={{ marginTop: 12 }}>
                <Donut
                  size={150}
                  data={(memory.data?.perHazard ?? []).map((row) => ({
                    label: HAZARD_SHORT[row.hazard as Hazard],
                    value: row.supportingIncidents,
                    color: HAZARD_COLOR[row.hazard as Hazard],
                  }))}
                  center={
                    <span className="mono" style={{ fontSize: 16 }}>
                      {num((memory.data?.perHazard ?? []).reduce((sum, row) => sum + row.supportingIncidents, 0))}
                    </span>
                  }
                />
              </div>
              <div className="divider" style={{ margin: '14px 0' }} />
              <div className="stack-list" style={{ gap: 6 }}>
                {(memory.data?.perHazard ?? []).map((row) => (
                  <div key={row.hazard} className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="row row--tight">
                      <span className="dot" style={{ background: HAZARD_COLOR[row.hazard as Hazard], color: HAZARD_COLOR[row.hazard as Hazard] }} />
                      <span className="t-xs">{HAZARD_SHORT[row.hazard as Hazard]}</span>
                    </span>
                    <span className="row row--tight">
                      <span className="mono t-xs" style={{ color: HAZARD_COLOR[row.hazard as Hazard] }}>
                        {pct(row.probabilityPct)}
                      </span>
                      <span className="t-xs t-mute">{row.supportingIncidents} refs</span>
                    </span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>
      </GlassCard>

      {/* ------------------------------------------------------------ evidence */}
      <section>
        <SectionHead
          icon="book"
          title={t('memory.evidence')}
          hint="The most severe recorded events behind this score"
          actions={
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => navigate('/knowledge')}>
              <Icon name="graph" size={12} /> {t('nav.knowledge')}
            </button>
          }
        />
        <GlassCard pad={false} style={{ marginTop: 12 }}>
          <AsyncBoundary loading={memory.loading} error={memory.error} onRetry={memory.reload}>
            <div className="table-wrap" style={{ border: 0, borderRadius: 0, maxHeight: 460 }}>
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
                  {(memory.data?.evidenceSample ?? []).map((row) => (
                    <tr
                      key={row.id}
                      className={cx('clickable', selected === row.id && 'is-selected')}
                      onClick={() => setSelected(selected === row.id ? null : row.id)}
                    >
                      <td className="t-xs t-mute nowrap">{timeAgo(row.date)}</td>
                      <td className="cell-strong nowrap">{row.wellName}</td>
                      <td>
                        <span className="row row--tight">
                          <span className="dot" style={{ background: HAZARD_COLOR[row.type as Hazard], color: HAZARD_COLOR[row.type as Hazard] }} />
                          <span className="t-sm">{row.label}</span>
                        </span>
                      </td>
                      <td className="t-sm t-dim">{row.formation}</td>
                      <td className="cell-num">{fmtDepth(row.depth)}</td>
                      <td>
                        <SeverityChip severity={row.severity} sm />
                      </td>
                      <td className="t-xs t-dim" style={{ maxWidth: 340 }}>{row.mitigation}</td>
                      <td>
                        <span className="chip chip--neutral chip--sm">{row.outcome}</span>
                      </td>
                    </tr>
                  ))}
                  {(memory.data?.evidenceSample ?? []).length === 0 && (
                    <tr>
                      <td colSpan={8} className="t-sm t-mute">
                        No offset-well evidence in the target formations — this well is drilling into the unknown.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </AsyncBoundary>
        </GlassCard>
        {selected && (
          <div className="banner banner--info" style={{ marginTop: 12 }}>
            <Icon name="info" size={15} />
            <span>
              Selected incident <strong className="mono">{selected}</strong>. Open the Incident Replay Center to step
              through its parameter log sample by sample.
            </span>
          </div>
        )}
      </section>

      {/* -------------------------------------------------------------- method */}
      <section>
        <GlassCard>
          <SectionHead icon="cpu" title="How the score is computed" />
          <div className="grid grid--2" style={{ marginTop: 12 }}>
            <ul className="bullets">
              <li><strong>Offset well volume</strong> (34 pts) — offset wells inside 18 km, saturating at 46.</li>
              <li><strong>Relevant incident volume</strong> (26 pts) — events recorded in the formations this well will penetrate, saturating at 150.</li>
            </ul>
            <ul className="bullets">
              <li><strong>Formation intelligence</strong> (24 pts) — mean of the Formation Time Machine scores for the target formations.</li>
              <li><strong>Knowledge reuse</strong> (16 pts) — the share of live hazard predictions that are actually backed by a recorded incidence.</li>
            </ul>
          </div>
          <div className="banner banner--info" style={{ marginTop: 14 }}>
            <Icon name="shield" size={15} />
            <span>
              A low score is not a reason to stop — it is a warning that the next decision has to be paid for with
              measurement, not memory.
            </span>
          </div>
        </GlassCard>
      </section>
    </div>
  );
}

function memoryTone(tone: string): string {
  const map: Record<string, string> = {
    cyan: '#22d3ee',
    blue: '#3b82f6',
    violet: '#a78bfa',
    orange: '#f97316',
    amber: '#f59e0b',
    green: '#22c55e',
    red: '#ef4444',
  };
  return map[tone] ?? '#22d3ee';
}
