import { useEffect, useMemo, useRef, useState } from 'react';
import { cx } from '../lib/format';

export interface GraphNode {
  id: string;
  label: string;
  kind: string;
  degree?: number;
  focus?: boolean;
  color: string;
  radius?: number;
  meta?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
  color?: string;
  dashed?: boolean;
  label?: string;
}

interface Position {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * A small force-directed layout: repulsion between all nodes, spring attraction
 * along edges, mild gravity to the centre, then a cooling schedule. Runs in a
 * fraction of a millisecond for the graph sizes this app produces, so the
 * layout is computed synchronously and then held in state (which lets the user
 * drag nodes without fighting the simulation).
 */
function layoutGraph(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number): Record<string, Position> {
  const positions: Record<string, Position> = {};
  const count = Math.max(1, nodes.length);
  nodes.forEach((node, index) => {
    const angle = (index / count) * Math.PI * 2;
    const ring = node.focus ? 0 : 0.24 + (index % 3) * 0.14;
    positions[node.id] = {
      x: width / 2 + Math.cos(angle) * ring * width * 0.44 + (Math.random() - 0.5) * 8,
      y: height / 2 + Math.sin(angle) * ring * height * 0.44 + (Math.random() - 0.5) * 8,
      vx: 0,
      vy: 0,
    };
  });

  const adjacency = edges
    .map((edge) => ({ source: positions[edge.source], target: positions[edge.target], weight: edge.weight }))
    .filter((edge) => edge.source && edge.target);

  const repulsion = Math.max(760, (width * height) / (count * 1.5));
  for (let iteration = 0; iteration < 340; iteration += 1) {
    const cooling = 1 - iteration / 360;

    for (let i = 0; i < nodes.length; i += 1) {
      const a = positions[nodes[i].id];
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = positions[nodes[j].id];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distanceSq = dx * dx + dy * dy;
        if (distanceSq < 1e-4) {
          dx = (Math.random() - 0.5) * 2;
          dy = (Math.random() - 0.5) * 2;
          distanceSq = 1;
        }
        const distance = Math.sqrt(distanceSq);
        const force = repulsion / distanceSq;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    for (const edge of adjacency) {
      const dx = edge.target.x - edge.source.x;
      const dy = edge.target.y - edge.source.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const target = Math.max(66, 200 - edge.weight * 110);
      const force = (distance - target) * 0.014 * (0.4 + edge.weight);
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      edge.source.vx += fx;
      edge.source.vy += fy;
      edge.target.vx -= fx;
      edge.target.vy -= fy;
    }

    for (const node of nodes) {
      const position = positions[node.id];
      position.vx += (width / 2 - position.x) * 0.0016 * cooling;
      position.vy += (height / 2 - position.y) * 0.0022 * cooling;
      position.x += position.vx * 0.32 * cooling;
      position.y += position.vy * 0.32 * cooling;
      position.vx *= 0.76;
      position.vy *= 0.76;
      position.x = Math.max(46, Math.min(width - 46, position.x));
      position.y = Math.max(34, Math.min(height - 34, position.y));
    }
  }
  return positions;
}

export function ForceGraph({
  nodes,
  edges,
  height = 460,
  onSelect,
  selectedId,
  labelMode = 'smart',
  draggable = true,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  height?: number;
  onSelect?: (node: GraphNode) => void;
  selectedId?: string | null;
  labelMode?: 'all' | 'smart' | 'none';
  draggable?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(760);
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const [hover, setHover] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setWidth(Math.max(360, node.clientWidth)));
    observer.observe(node);
    setWidth(Math.max(360, node.clientWidth));
    return () => observer.disconnect();
  }, []);

  const signature = useMemo(() => `${nodes.map((node) => node.id).join('|')}#${width}x${height}`, [nodes, width, height]);

  useEffect(() => {
    setPositions(layoutGraph(nodes, edges, width, height));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPositions((prev) => ({
        ...prev,
        [drag.id]: {
          ...prev[drag.id],
          x: Math.max(30, Math.min(width - 30, event.clientX - rect.left - drag.offsetX)),
          y: Math.max(24, Math.min(height - 24, event.clientY - rect.top - drag.offsetY)),
          vx: 0,
          vy: 0,
        },
      }));
    };
    const up = () => setDrag(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [drag, width, height]);

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const activeId = hover ?? selectedId ?? null;
  const neighbours = useMemo(() => {
    if (!activeId) return new Set<string>();
    const set = new Set<string>([activeId]);
    for (const edge of edges) {
      if (edge.source === activeId) set.add(edge.target);
      if (edge.target === activeId) set.add(edge.source);
    }
    return set;
  }, [activeId, edges]);

  return (
    <div ref={wrapRef} className="graph-shell" style={{ height }}>
      <svg width={width} height={height} style={{ display: 'block' }}>
        <defs>
          <filter id="graph-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g>
          {edges.map((edge) => {
            const a = positions[edge.source];
            const b = positions[edge.target];
            if (!a || !b) return null;
            const dim = activeId ? !(neighbours.has(edge.source) && neighbours.has(edge.target)) : false;
            const emphasized = activeId && (edge.source === activeId || edge.target === activeId);
            return (
              <line
                key={edge.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={edge.color ?? (emphasized ? '#22d3ee' : '#4b7fa8')}
                strokeWidth={Math.max(0.6, edge.weight * (emphasized ? 2.4 : 1.5))}
                strokeDasharray={edge.dashed ? '4 4' : undefined}
                opacity={dim ? 0.09 : emphasized ? 0.85 : 0.3}
              />
            );
          })}
        </g>

        <g>
          {nodes.map((node) => {
            const position = positions[node.id];
            if (!position) return null;
            const radius = node.radius ?? (node.focus ? 17 : 8 + Math.min(9, (node.degree ?? 1) * 0.7));
            const dim = activeId ? !neighbours.has(node.id) : false;
            const showLabel =
              labelMode === 'all' || (labelMode === 'smart' && (node.focus || (node.degree ?? 0) >= 4 || hover === node.id));
            return (
              <g
                key={node.id}
                className={cx('graph-node', node.focus && 'graph-node--focus')}
                opacity={dim ? 0.24 : 1}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHover(node.id)}
                onMouseLeave={() => setHover(null)}
                onPointerDown={(event) => {
                  if (!draggable) return;
                  const rect = wrapRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  setDrag({
                    id: node.id,
                    offsetX: event.clientX - rect.left - position.x,
                    offsetY: event.clientY - rect.top - position.y,
                  });
                }}
                onClick={() => onSelect?.(node)}
              >
                <circle
                  cx={position.x}
                  cy={position.y}
                  r={radius + (node.focus ? 8 : 3)}
                  fill={node.color}
                  opacity={node.focus ? 0.22 : 0.14}
                />
                <circle
                  cx={position.x}
                  cy={position.y}
                  r={radius}
                  fill={node.color}
                  stroke={node.focus ? '#e8f1fb' : 'rgba(4,7,15,.85)'}
                  strokeWidth={node.focus ? 2.4 : 1.6}
                  filter={node.focus || hover === node.id ? 'url(#graph-glow)' : undefined}
                />
                {showLabel && (
                  <text
                    x={position.x}
                    y={position.y + radius + 12}
                    textAnchor="middle"
                    style={{ fontSize: node.focus ? 11.5 : 10 }}
                  >
                    {node.label.length > 24 ? `${node.label.slice(0, 23)}…` : node.label}
                  </text>
                )}
                <title>{node.meta ? `${node.label} — ${node.meta}` : node.label}</title>
              </g>
            );
          })}
        </g>
      </svg>

      {hover && nodeById.get(hover) && (
        <div
          className="map-panel"
          style={{ position: 'absolute', left: 12, bottom: 12, maxWidth: 320, pointerEvents: 'none' }}
        >
          <div style={{ fontWeight: 640, fontSize: 12.6 }}>{nodeById.get(hover)!.label}</div>
          <div className="t-xs t-mute" style={{ textTransform: 'capitalize' }}>
            {nodeById.get(hover)!.kind}
            {nodeById.get(hover)!.meta ? ` · ${nodeById.get(hover)!.meta}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
