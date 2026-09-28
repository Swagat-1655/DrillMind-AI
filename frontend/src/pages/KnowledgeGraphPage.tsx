import { useMemo, useState } from 'react';
import { ForceGraph, type GraphEdge, type GraphNode } from '../components/graph';
import { AsyncBoundary, Chip, GlassCard, Icon, MeterRow, SectionHead } from '../components/ui';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { HAZARD_COLOR, HAZARD_SHORT, cx, num, pct } from '../lib/format';
import { useAsync } from '../lib/hooks';
import type { Hazard } from '../lib/types';
import { useApp } from '../store';

const KIND_META: Record<string, { color: string; label: string; icon: 'pin' | 'formation' | 'risk' | 'database' | 'shield' | 'person' }> = {
  well: { color: '#38bdf8', label: 'Well', icon: 'pin' },
  formation: { color: '#22d3ee', label: 'Formation', icon: 'formation' },
  hazard: { color: '#ef4444', label: 'Hazard', icon: 'risk' },
  reservoir: { color: '#10b981', label: 'Reservoir', icon: 'database' },
  mitigation: { color: '#f59e0b', label: 'Mitigation', icon: 'shield' },
  operator: { color: '#a78bfa', label: 'Operator', icon: 'person' },
};

export default function KnowledgeGraphPage() {
  const { t } = useI18n();
  const { focusWellId, focusWell } = useApp();
  const [limit, setLimit] = useState(22);
  const [selected, setSelected] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<Set<string>>(new Set(Object.keys(KIND_META)));

  const graph = useAsync(
    (signal) => api.knowledgeGraph(focusWellId ?? undefined, limit, signal),
    [focusWellId, limit],
  );

  const nodes: GraphNode[] = useMemo(
    () =>
      (graph.data?.nodes ?? [])
        .filter((node) => kindFilter.has(node.kind))
        .map((node) => {
          const meta = KIND_META[node.kind] ?? { color: '#22d3ee', label: node.kind, icon: 'pin' as const };
          return {
            id: node.id,
            label: node.label,
            kind: meta.label,
            degree: node.degree,
            focus: node.focus,
            color: node.focus ? '#f97316' : meta.color,
            radius: node.focus ? 18 : node.kind === 'hazard' ? 13 : node.kind === 'mitigation' ? 7 : 10,
            meta:
              node.kind === 'well'
                ? `${node.status ?? ''} · risk ${node.riskBand ?? ''}${node.similarity ? ` · ${node.similarity.toFixed(0)}% similar` : ''}`
                : node.kind === 'hazard'
                  ? node.hazard
                    ? HAZARD_SHORT[node.hazard]
                    : ''
                  : node.kind === 'mitigation'
                    ? `${node.successRate ?? 0}% success over ${node.attempts ?? 0} attempts`
                    : node.kind === 'formation'
                      ? `${node.basin ?? ''}${node.focusFormation ? ' · target formation' : ''}`
                      : '',
          };
        }),
    [graph.data, kindFilter],
  );

  const visibleIds = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);

  const edges: GraphEdge[] = useMemo(
    () =>
      (graph.data?.edges ?? [])
        .filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))
        .map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          weight: edge.weight,
          color:
            edge.relation === 'HOSTS'
              ? '#ef4444'
              : edge.relation === 'MITIGATED_BY'
                ? '#22c55e'
                : edge.relation === 'ANALOGOUS_TO'
                  ? '#a78bfa'
                  : '#4b7fa8',
          dashed: edge.relation === 'CONTAINS' || edge.relation === 'OPERATED_BY',
          label: edge.relation,
        })),
    [graph.data, visibleIds],
  );

  const selectedNode = graph.data?.nodes.find((node) => node.id === selected) ?? null;
  const selectedEdges = useMemo(
    () => (graph.data?.edges ?? []).filter((edge) => edge.source === selected || edge.target === selected),
    [graph.data, selected],
  );

  const kindCounts = graph.data?.stats.byKind ?? {};
  const relationCounts = graph.data?.stats.byRelation ?? {};

  return (
    <div className="stack-list" style={{ gap: 18 }}>
      <GlassCard glow>
        <SectionHead
          icon="graph"
          title={t('knowledge.title')}
          hint={
            focusWell
              ? `Institutional drilling memory around ${focusWell.name} · ${focusWell.field}`
              : t('knowledge.subtitle')
          }
          actions={
            <>
              <Chip className="chip chip--cyan">{num(graph.data?.stats.nodes ?? 0)} {t('knowledge.nodes')}</Chip>
              <Chip className="chip chip--violet">{num(graph.data?.stats.edges ?? 0)} {t('knowledge.edges')}</Chip>
              {[10, 22, 40, 60].map((count) => (
                <button
                  key={count}
                  type="button"
                  className={cx('btn', 'btn--sm', limit === count ? 'btn--primary' : 'btn--ghost')}
                  onClick={() => setLimit(count)}
                >
                  {count} wells
                </button>
              ))}
            </>
          }
        />

        <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <span className="t-label" style={{ marginRight: 4 }}>{t('knowledge.legend')}</span>
          {Object.entries(KIND_META).map(([kind, meta]) => {
            const active = kindFilter.has(kind);
            return (
              <button
                key={kind}
                type="button"
                className={cx('btn', 'btn--sm', active ? 'btn--ghost' : 'btn--ghost')}
                style={{ opacity: active ? 1 : 0.42 }}
                onClick={() =>
                  setKindFilter((prev) => {
                    const next = new Set(prev);
                    if (next.has(kind)) next.delete(kind);
                    else next.add(kind);
                    return next.size === 0 ? new Set(Object.keys(KIND_META)) : next;
                  })
                }
              >
                <span className="dot" style={{ background: meta.color, color: meta.color }} />
                {meta.label} <span className="mono t-xs t-mute">{kindCounts[kind] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </GlassCard>

      <div className="grid grid--split-wide" style={{ alignItems: 'start' }}>
        <GlassCard pad={false}>
          <div style={{ padding: '16px 18px 0' }}>
            <SectionHead
              icon="network"
              title="Institutional memory graph"
              hint="Wells connect to the formations they penetrated, formations to the hazards they host, hazards to the mitigations that worked"
            />
          </div>
          <AsyncBoundary loading={graph.loading} error={graph.error} onRetry={graph.reload}>
            <div style={{ padding: 12 }}>
              <ForceGraph
                nodes={nodes}
                edges={edges}
                height={520}
                selectedId={selected}
                onSelect={(node) => setSelected(node.id === selected ? null : node.id)}
              />
            </div>
          </AsyncBoundary>
        </GlassCard>

        <div className="stack-list">
          <GlassCard>
            <SectionHead
              icon="pin"
              title={selectedNode ? 'Selected entity' : 'Select an entity'}
              hint={selectedNode?.kind}
            />
            {selectedNode ? (
              <div className="stack-list" style={{ marginTop: 12 }}>
                <div className="row row--tight">
                  <span
                    className="dot"
                    style={{
                      background: KIND_META[selectedNode.kind]?.color ?? '#22d3ee',
                      color: KIND_META[selectedNode.kind]?.color ?? '#22d3ee',
                    }}
                  />
                  <span style={{ fontWeight: 640, fontSize: 13.5 }}>{selectedNode.label}</span>
                </div>
                <div className="grid grid--2" style={{ gap: 8 }}>
                  {[
                    ['Kind', selectedNode.kind],
                    ['Connections', String(selectedNode.degree)],
                    ...(selectedNode.status ? [['Status', selectedNode.status]] : []),
                    ...(selectedNode.riskBand ? [['Risk band', selectedNode.riskBand]] : []),
                    ...(selectedNode.basin ? [['Basin', selectedNode.basin]] : []),
                    ...(selectedNode.successRate !== undefined
                      ? [['Success rate', `${selectedNode.successRate}%`]]
                      : []),
                    ...(selectedNode.attempts !== undefined ? [['Attempts', String(selectedNode.attempts)]] : []),
                  ].map(([label, value]) => (
                    <div key={label} className="glass" style={{ padding: '8px 10px' }}>
                      <div className="t-label" style={{ fontSize: 9.4 }}>{label}</div>
                      <div className="mono t-sm">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="divider" />
                <span className="t-label">Relations</span>
                <div className="stack-list" style={{ gap: 6 }}>
                  {selectedEdges.slice(0, 12).map((edge) => {
                    const other = edge.source === selected ? edge.target : edge.source;
                    const otherNode = graph.data?.nodes.find((node) => node.id === other);
                    return (
                      <button
                        key={edge.id}
                        type="button"
                        onClick={() => setSelected(other)}
                        className="row"
                        style={{
                          justifyContent: 'space-between',
                          width: '100%',
                          background: 'transparent',
                          border: 0,
                          cursor: 'pointer',
                          textAlign: 'left',
                          padding: '4px 0',
                        }}
                      >
                        <span className="row row--tight">
                          <span
                            className="dot"
                            style={{
                              background: KIND_META[otherNode?.kind ?? 'well']?.color ?? '#22d3ee',
                              color: KIND_META[otherNode?.kind ?? 'well']?.color ?? '#22d3ee',
                            }}
                          />
                          <span className="t-xs">{otherNode?.label ?? other}</span>
                        </span>
                        <span className="row row--tight">
                          {edge.relation === 'MITIGATED_BY' && edge.successRate !== undefined && (
                            <span className="mono t-xs" style={{ color: '#22c55e' }}>{edge.successRate}%</span>
                          )}
                          {edge.count !== undefined && <span className="mono t-xs t-mute">{edge.count}×</span>}
                          <span className="chip chip--neutral chip--sm" style={{ textTransform: 'none', letterSpacing: 0 }}>
                            {edge.relation}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="empty" style={{ padding: '28px 10px' }}>
                <Icon name="graph" size={20} />
                Click a node to inspect its connections.
              </div>
            )}
          </GlassCard>

          <GlassCard>
            <SectionHead icon="analytics" title={t('knowledge.relations')} hint="Edge types in the current view" />
            <div className="stack-list" style={{ marginTop: 12, gap: 8 }}>
              {Object.entries(relationCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([relation, count]) => (
                  <MeterRow
                    key={relation}
                    label={relation.replace(/_/g, ' ').toLowerCase()}
                    value={count}
                    max={Math.max(...Object.values(relationCounts), 1)}
                    color={
                      relation === 'HOSTS'
                        ? '#ef4444'
                        : relation === 'MITIGATED_BY'
                          ? '#22c55e'
                          : relation === 'ANALOGOUS_TO'
                            ? '#a78bfa'
                            : '#22d3ee'
                    }
                    suffix=""
                  />
                ))}
            </div>
            <div className="divider" style={{ margin: '14px 0' }} />
            <div className="stack-list" style={{ gap: 7 }}>
              {Object.entries(kindCounts).map(([kind, count]) => (
                <div key={kind} className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="row row--tight">
                    <span className="dot" style={{ background: KIND_META[kind]?.color ?? '#22d3ee', color: KIND_META[kind]?.color ?? '#22d3ee' }} />
                    <span className="t-sm">{KIND_META[kind]?.label ?? kind}</span>
                  </span>
                  <span className="mono t-sm t-dim">{num(count)}</span>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard>
            <SectionHead icon="info" title="What this graph proves" />
            <ul className="bullets" style={{ marginTop: 10 }}>
              <li>
                Every hazard mitigation edge carries a measured success rate, so the graph is a ranking of what actually
                worked in this basin.
              </li>
              <li>
                Offset wells are linked to the target well by similarity, turning &ldquo;similar well&rdquo; into a navigable
                chain of evidence.
              </li>
              <li>
                Formations connect to reservoirs so geologists and drillers argue from the same object model.
              </li>
            </ul>
          </GlassCard>
        </div>
      </div>

      <GlassCard>
        <SectionHead icon="shield" title="Mitigations that worked best in this neighbourhood" hint="Weighted by attempts and success outcome" />
        <div style={{ marginTop: 12 }}>
          <div className="grid grid--2">
            {(graph.data?.edges ?? [])
              .filter((edge) => edge.relation === 'MITIGATED_BY')
              .sort((a, b) => (b.successRate ?? 0) * Math.log1p(b.attempts ?? 1) - (a.successRate ?? 0) * Math.log1p(a.attempts ?? 1))
              .slice(0, 8)
              .map((edge) => {
                const target = graph.data?.nodes.find((node) => node.id === edge.target);
                const source = graph.data?.nodes.find((node) => node.id === edge.source);
                return (
                  <div key={edge.id} className="glass" style={{ padding: '11px 13px' }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="row row--tight">
                        <span
                          className="dot"
                          style={{
                            background: HAZARD_COLOR[(source?.hazard ?? 'MUDFLOSS') as Hazard],
                            color: HAZARD_COLOR[(source?.hazard ?? 'MUDFLOSS') as Hazard],
                          }}
                        />
                        <span className="t-xs" style={{ color: HAZARD_COLOR[(source?.hazard ?? 'MUDFLOSS') as Hazard] }}>
                          {source?.label ?? 'hazard'}
                        </span>
                      </span>
                      <span className="row row--tight">
                        <span className="mono t-sm" style={{ color: '#22c55e' }}>{pct(edge.successRate ?? 0)}</span>
                        <span className="t-xs t-mute">{edge.attempts ?? 0} attempts</span>
                      </span>
                    </div>
                    <div className="t-xs t-dim" style={{ marginTop: 6 }}>{target?.label ?? edge.target}</div>
                  </div>
                );
              })}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
