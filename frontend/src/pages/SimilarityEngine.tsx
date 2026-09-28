import { useEffect, useState } from 'react';
import { ForceGraph, type GraphEdge, type GraphNode } from '../components/graph';
import {
  AsyncBoundary,
  BandChip,
  Chip,
  GlassCard,
  Icon,
  MeterRow,
  OutcomeChip,
  SectionHead,
  SeverityChip,
  StatusChip,
} from '../components/ui';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { HAZARD_COLOR, STATUS_COLOR, compact, cx, depth as fmtDepth, num, pct, scoreColor } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { useApp } from '../store';

const GROUP_COLORS: Record<string, string> = {
  formation: '#22d3ee',
  depth: '#3b82f6',
  pressure: '#a78bfa',
  parameters: '#f59e0b',
  events: '#ef4444',
};

export default function SimilarityEngine() {
  const { t, isHindi } = useI18n();
  const { focusWellId, focusWell, setFocusWellId } = useApp();
  const focusKey = focusWellId ?? 'auto';
  const [selected, setSelected] = useState<string | null>(null);
  const [limited, setLimited] = useState(10);

  const similar = useAsync((signal) => api.similar(focusKey, limited, signal), [focusKey, limited]);

  useEffect(() => {
    setSelected(null);
  }, [focusKey]);

  const active = similar.data?.matches.find((match) => match.wellId === selected) ?? similar.data?.matches[0] ?? null;

  const nodes: GraphNode[] = (similar.data?.network.nodes ?? []).map((node) => ({
    id: node.id,
    label: node.name,
    kind: node.kind === 'focus' ? 'focus well' : 'analogue',
    degree: node.kind === 'focus' ? 12 : 4,
    focus: node.kind === 'focus',
    color: node.kind === 'focus' ? '#f97316' : '#a78bfa',
    radius: node.kind === 'focus' ? 19 : 8 + (node.similarity / 100) * 7,
    meta: `${node.formation} · ${node.similarity.toFixed(0)}% similar · risk ${node.riskBand}`,
  }));

  const edges: GraphEdge[] = (similar.data?.network.edges ?? []).map((edge) => ({
    id: `${edge.source}-${edge.target}-${edge.secondary ? 's' : 'p'}`,
    source: edge.source,
    target: edge.target,
    weight: edge.weight,
    color: edge.secondary ? '#4b7fa8' : '#a78bfa',
    dashed: edge.secondary,
  }));

  return (
    <div className="stack-list" style={{ gap: 18 }}>
      <GlassCard glow>
        <SectionHead
          icon="similarity"
          title={t('nav.similarity')}
          hint={
            focusWell
              ? `Analogue wells for ${focusWell.name} · ${focusWell.formation} · ${fmtDepth(focusWell.totalDepthMd)} TD`
              : undefined
          }
          actions={
            <>
              <Chip className="chip chip--cyan">
                {similar.data?.matches.length ?? 0} analogues
              </Chip>
              {focusWell && <StatusChip status={focusWell.status} />}
            </>
          }
        />

        <div className="grid grid--split" style={{ marginTop: 16, alignItems: 'start' }}>
          <div className="stack-list">
            <div className="banner banner--info" style={{ alignItems: 'flex-start' }}>
              <Icon name="info" size={15} style={{ marginTop: 2 }} />
              <span style={{ lineHeight: 1.68 }}>
                {similar.data?.method.note ??
                  'Group scores are blended with published weights, then nudged by geographic proximity as a tie-breaker.'}
              </span>
            </div>

            <div className="stack-list" style={{ gap: 10 }}>
              {(similar.data?.method.groups ?? []).map((group) => (
                <div key={group.key} className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="row row--tight">
                    <span className="dot" style={{ background: GROUP_COLORS[group.key] ?? '#22d3ee', color: GROUP_COLORS[group.key] ?? '#22d3ee' }} />
                    <span className="t-sm">{group.label}</span>
                  </span>
                  <span className="mono t-xs t-mute">weight {(group.weight * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>

            <div className="divider" />

            <div className="row" style={{ gap: 10 }}>
              <span className="t-label">How many analogues</span>
              {[5, 10, 15, 25].map((count) => (
                <button
                  key={count}
                  type="button"
                  className={cx('btn', 'btn--sm', limited === count ? 'btn--primary' : 'btn--ghost')}
                  onClick={() => setLimited(count)}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          <GlassCard>
            <SectionHead icon="network" title="Similarity network" hint="Drag nodes to explore; line weight encodes similarity" />
            <div style={{ marginTop: 12 }}>
              <ForceGraph
                nodes={nodes}
                edges={edges}
                height={382}
                selectedId={active?.wellId}
                onSelect={(node) => node.id !== focusWellId && setSelected(node.id)}
              />
            </div>
          </GlassCard>
        </div>
      </GlassCard>

      {/* -------------------------------------------------------- match list */}
      <section>
        <SectionHead
          icon="target"
          title="Most similar wells"
          hint="Ranked by blended evidence similarity"
        />
        <AsyncBoundary loading={similar.loading} error={similar.error} onRetry={similar.reload}>
          <div className="grid grid--split-wide" style={{ marginTop: 12, alignItems: 'start' }}>
            <div className="stack-list">
              {(similar.data?.matches ?? []).map((match) => {
                const active = match.wellId === (selected ?? similar.data?.matches[0]?.wellId);
                return (
                  <button
                    key={match.wellId}
                    type="button"
                    onClick={() => setSelected(match.wellId)}
                    className={cx('glass', 'glass--pad', active && 'glass--glow')}
                    style={{ textAlign: 'left', cursor: 'pointer', border: `1px solid ${active ? 'var(--border-glow)' : 'var(--border)'}` }}
                  >
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="row row--tight">
                        <span
                          className="mono"
                          style={{ fontSize: 22, color: '#a78bfa', letterSpacing: '-0.03em' }}
                        >
                          {match.similarity.toFixed(0)}%
                        </span>
                        <span>
                          <span style={{ display: 'block', fontWeight: 640, fontSize: 13.5 }}>{match.name}</span>
                          <span className="t-xs t-mute">
                            {match.field} · {match.formation} · {match.distanceKm.toFixed(1)} km away
                          </span>
                        </span>
                      </span>
                      <span className="row row--tight">
                        <BandChip band={match.riskBand} sm />
                        <StatusChip status={match.status} sm />
                      </span>
                    </div>

                    <div className="grid grid--4" style={{ marginTop: 11, gap: 8 }}>
                      {match.groups.map((group) => (
                        <MeterRow
                          key={group.group}
                          label={group.label.split(' ')[0]}
                          value={group.score}
                          color={GROUP_COLORS[group.group] ?? '#22d3ee'}
                        />
                      ))}
                    </div>

                    <div className="row row--tight t-xs t-mute" style={{ marginTop: 10 }}>
                      <span>TD {fmtDepth(match.totalDepthMd)}</span>
                      <span>·</span>
                      <span>{match.eventCount} events ({match.criticalEventCount} critical)</span>
                      <span>·</span>
                      <span>{num(match.totalNptHours)} hr NPT</span>
                      <span>·</span>
                      <span>offset risk {pct(match.riskScore)}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* -------------------------------------------------- active match */}
            {active && (
              <div className="stack-list">
                <GlassCard glow>
                  <SectionHead
                    icon="pin"
                    title={active.name}
                    hint={`${active.operator} · ${active.field} · ${active.basin} basin`}
                    actions={
                      <button type="button" className="btn btn--sm" onClick={() => setFocusWellId(active.wellId)}>
                        <Icon name="target" size={12} /> Focus this well
                      </button>
                    }
                  />
                  <div className="row" style={{ marginTop: 14, justifyContent: 'center' }}>
                    <span className="mono" style={{ fontSize: 44, color: '#a78bfa', letterSpacing: '-0.04em' }}>
                      {active.similarity.toFixed(1)}%
                    </span>
                  </div>
                  <div className="t-center t-xs t-mute">blended similarity to {focusWell?.name ?? 'the focus well'}</div>

                  <div className="stack-list" style={{ marginTop: 16, gap: 9 }}>
                    {active.groups.map((group) => (
                      <div key={group.group}>
                        <MeterRow
                          label={`${group.label} (${(group.weight * 100).toFixed(0)}%)`}
                          value={group.score}
                          color={GROUP_COLORS[group.group] ?? '#22d3ee'}
                          animated
                        />
                      </div>
                    ))}
                  </div>

                  <div className="divider" style={{ margin: '14px 0' }} />
                  <div className="grid grid--2" style={{ gap: 10 }}>
                    {[
                      ['Total depth', fmtDepth(active.totalDepthMd)],
                      ['Risk band', active.riskBand],
                      ['Events', String(active.eventCount)],
                      ['Critical events', String(active.criticalEventCount)],
                      ['NPT hours', num(active.totalNptHours)],
                      ['Distance', `${active.distanceKm.toFixed(1)} km`],
                    ].map(([label, value]) => (
                      <div key={label} className="glass" style={{ padding: '8px 10px' }}>
                        <div className="t-label" style={{ fontSize: 9.4 }}>{label}</div>
                        <div className="mono t-sm" style={{ color: scoreColor(active.riskScore) }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </GlassCard>

                <GlassCard>
                  <SectionHead
                    icon="book"
                    title={t('common.lessons')}
                    hint="Transferred from this analogue to the active well"
                  />
                  <div className="stack-list" style={{ marginTop: 12 }}>
                    {active.lessonsLearned.map((lesson, index) => (
                      <div key={`${lesson.eventType}-${index}`} className="glass" style={{ padding: '10px 12px' }}>
                        <div className="row row--tight" style={{ justifyContent: 'space-between' }}>
                          <span className="row row--tight">
                            <span className="dot" style={{ background: HAZARD_COLOR[lesson.eventType], color: HAZARD_COLOR[lesson.eventType] }} />
                            <span className="t-sm" style={{ fontWeight: 620 }}>{lesson.label}</span>
                          </span>
                          <span className="row row--tight">
                            <SeverityChip severity={lesson.severity} sm />
                            <OutcomeChip outcome={lesson.outcome} sm />
                          </span>
                        </div>
                        <div className="t-xs t-mute" style={{ marginTop: 5 }}>
                          {lesson.formation} · {fmtDepth(lesson.depth)}
                        </div>
                        <div className="t-sm" style={{ marginTop: 6 }}>{lesson.text}</div>
                      </div>
                    ))}
                    {active.lessonsLearned.length === 0 && (
                      <span className="t-sm t-mute">This analogue recorded no events — a genuinely useful reference point.</span>
                    )}
                  </div>
                </GlassCard>

                <GlassCard>
                  <SectionHead
                    icon="history"
                    title="Shared formation events"
                    hint={`Events in formations the active well will also penetrate`}
                  />
                  <div className="stack-list" style={{ marginTop: 12 }}>
                    {active.sharedEvents.map((event, index) => (
                      <div key={`${event.type}-${index}`} className="row" style={{ justifyContent: 'space-between' }}>
                        <span className="row row--tight">
                          <span className="dot" style={{ background: HAZARD_COLOR[event.type], color: HAZARD_COLOR[event.type] }} />
                          <span className="t-sm">{event.label}</span>
                          <span className="t-xs t-mute">{event.formation}</span>
                        </span>
                        <span className="row row--tight">
                          <span className="mono t-xs">{fmtDepth(event.depth)}</span>
                          <span className="t-xs t-mute">{num(event.nptHours)} hr</span>
                        </span>
                      </div>
                    ))}
                    {active.sharedEvents.length === 0 && (
                      <span className="t-sm t-mute">No shared-formation events recorded on this analogue.</span>
                    )}
                  </div>
                </GlassCard>
              </div>
            )}
          </div>
        </AsyncBoundary>
      </section>

      {/* ------------------------------------------------------- group matrix */}
      <section>
        <SectionHead
          icon="analytics"
          title="Evidence group matrix"
          hint="Every analogue scored against all five evidence groups"
        />
        <GlassCard pad={false} style={{ marginTop: 12 }}>
          <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Well</th>
                  <th>Overall</th>
                  <th>Formation</th>
                  <th>Depth</th>
                  <th>Pressure</th>
                  <th>Parameters</th>
                  <th>Events</th>
                  <th>Distance</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {(similar.data?.matches ?? []).map((match) => (
                  <tr key={match.wellId} className="clickable" onClick={() => setSelected(match.wellId)}>
                    <td className="cell-strong nowrap">{match.name}</td>
                    <td>
                      <span className="mono" style={{ color: '#a78bfa' }}>{match.similarity.toFixed(1)}%</span>
                    </td>
                    {['formation', 'depth', 'pressure', 'parameters', 'events'].map((key) => {
                      const group = match.groups.find((item) => item.group === key);
                      return (
                        <td key={key} className="cell-num" style={{ color: scoreColor(group?.score ?? 0) }}>
                          {(group?.score ?? 0).toFixed(0)}
                        </td>
                      );
                    })}
                    <td className="cell-num t-mute">{match.distanceKm.toFixed(1)} km</td>
                    <td>
                      <span className="row row--tight">
                        <span className="mono t-xs" style={{ color: STATUS_COLOR[match.status] }}>
                          {match.riskScore.toFixed(0)}
                        </span>
                        <BandChip band={match.riskBand} sm />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
        <div className="row t-xs t-mute" style={{ marginTop: 10, gap: 14 }}>
          <span>{compact((similar.data?.matches ?? []).reduce((sum, match) => sum + match.totalNptHours, 0))} hr of NPT across the analogue set</span>
          <span>{isHindi ? 'प्रत्येक स्कोर की व्याख्या ड्रिलिंग इंजीनियर के तर्क से की गई है।' : 'Each group is an explicit, engineer-readable comparison — never a hidden embedding.'}</span>
        </div>
      </section>
    </div>
  );
}
