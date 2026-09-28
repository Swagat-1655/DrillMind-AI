import { useMemo, useState, type ReactNode } from 'react';
import { useElementSize } from '../lib/hooks';
import { cx, ticks } from '../lib/format';

/* --------------------------------------------------------------------------
 * Shared plumbing — charts measure their container so text stays crisp.
 * ------------------------------------------------------------------------ */

function useChartSize(height: number) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const width = Math.max(240, size.width || 520);
  return { ref, width, height };
}

export interface Series {
  key: string;
  label: string;
  color: string;
  values: number[];
  dashed?: boolean;
  area?: boolean;
  width?: number;
}

interface ChartProps {
  series: Series[];
  xLabels: (string | number)[];
  height?: number;
  yMax?: number;
  yMin?: number;
  yUnit?: string;
  xTitle?: string;
  yTitle?: string;
  markerIndex?: number;
  refLines?: { value: number; label: string; color: string }[];
  onHover?: (index: number | null) => void;
}

const PAD = { top: 16, right: 16, bottom: 30, left: 48 };

function buildPath(values: number[], xs: number[], ys: (v: number) => number): string {
  return values
    .map((value, index) => `${index === 0 ? 'M' : 'L'}${xs[index].toFixed(2)},${ys(value).toFixed(2)}`)
    .join(' ');
}

export function LineChart({
  series,
  xLabels,
  height = 210,
  yMax,
  yMin = 0,
  yUnit = '',
  xTitle,
  yTitle,
  markerIndex,
  refLines = [],
  onHover,
}: ChartProps) {
  const { ref, width, height: chartHeight } = useChartSize(height);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [hover, setHover] = useState<number | null>(null);

  const visible = series.filter((item) => !hidden[item.key]);
  const max = yMax ?? Math.max(1, ...series.flatMap((item) => item.values));
  const plotW = width - PAD.left - PAD.right;
  const plotH = chartHeight - PAD.top - PAD.bottom;
  const count = Math.max(1, xLabels.length - 1);
  const xs = xLabels.map((_, index) => PAD.left + (index / count) * plotW);
  const ys = (value: number) => PAD.top + plotH - ((value - yMin) / Math.max(1e-6, max - yMin)) * plotH;
  const gridValues = useMemo(() => ticks(yMin, max, 4), [yMin, max]);
  const labelStep = Math.max(1, Math.ceil(xLabels.length / 8));

  const report = (index: number | null) => {
    setHover(index);
    onHover?.(index);
  };

  return (
    <div ref={ref} style={{ width: '100%' }}>
      {series.length > 1 && (
        <div className="chart-legend">
          {series.map((item) => (
            <span
              key={item.key}
              className="chart-legend__item"
              data-off={hidden[item.key] ? 'true' : 'false'}
              onClick={() => setHidden((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
            >
              <span className="chart-legend__swatch" style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <svg className="chart" width={width} height={chartHeight} role="img">
          {gridValues.map((value) => (
            <g key={value}>
              <line className="grid-line" x1={PAD.left} x2={PAD.left + plotW} y1={ys(value)} y2={ys(value)} />
              <text className="axis-label" x={PAD.left - 8} y={ys(value) + 3.5} textAnchor="end">
                {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(value < 10 ? 1 : 0)}
              </text>
            </g>
          ))}

          {refLines.map((line) => (
            <g key={line.label}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={ys(line.value)}
                y2={ys(line.value)}
                stroke={line.color}
                strokeWidth={1.2}
                strokeDasharray="5 5"
                opacity={0.75}
              />
              <text x={PAD.left + plotW - 4} y={ys(line.value) - 5} textAnchor="end" fontSize={9.5} fill={line.color}>
                {line.label}
              </text>
            </g>
          ))}

          {visible.map((item) => (
            <g key={item.key}>
              {item.area !== false && (
                <path
                  d={`${buildPath(item.values, xs, ys)} L${xs[xs.length - 1]},${PAD.top + plotH} L${xs[0]},${PAD.top + plotH} Z`}
                  fill={item.color}
                  opacity={0.13}
                />
              )}
              <path
                d={buildPath(item.values, xs, ys)}
                fill="none"
                stroke={item.color}
                strokeWidth={item.width ?? 2.1}
                strokeDasharray={item.dashed ? '5 4' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          ))}

          {markerIndex !== undefined && markerIndex >= 0 && markerIndex < xs.length && (
            <g>
              <line
                x1={xs[markerIndex]}
                x2={xs[markerIndex]}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="#22d3ee"
                strokeWidth={1.4}
                strokeDasharray="4 3"
              />
              {visible.map((item) => (
                <circle key={item.key} cx={xs[markerIndex]} cy={ys(item.values[markerIndex] ?? 0)} r={4} fill={item.color} stroke="#04070f" strokeWidth={1.6} />
              ))}
            </g>
          )}

          {hover !== null && (
            <line x1={xs[hover]} x2={xs[hover]} y1={PAD.top} y2={PAD.top + plotH} stroke="rgba(122,176,224,.5)" strokeWidth={1} />
          )}

          {xLabels.map((label, index) =>
            index % labelStep === 0 || index === xLabels.length - 1 ? (
              <text key={`${label}-${index}`} className="axis-label" x={xs[index]} y={chartHeight - 11} textAnchor="middle">
                {label}
              </text>
            ) : null,
          )}

          {xTitle && (
            <text className="axis-label" x={PAD.left + plotW / 2} y={chartHeight - 1} textAnchor="middle">
              {xTitle}
            </text>
          )}
          {yTitle && (
            <text
              className="axis-label"
              transform={`translate(11 ${PAD.top + plotH / 2}) rotate(-90)`}
              textAnchor="middle"
            >
              {yTitle}
            </text>
          )}

          {xLabels.map((_, index) => (
            <rect
              key={index}
              x={xs[index] - plotW / count / 2}
              y={PAD.top}
              width={plotW / count}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => report(index)}
              onMouseLeave={() => report(null)}
            />
          ))}
        </svg>

        {hover !== null && visible.length > 0 && (
          <div
            className="map-panel"
            style={{
              position: 'absolute',
              left: Math.min(Math.max(xs[hover] + 12, 8), width - 150),
              top: 8,
              pointerEvents: 'none',
              zIndex: 5,
              minWidth: 132,
            }}
          >
            <div className="t-label" style={{ marginBottom: 5 }}>
              {xLabels[hover]} {yUnit && `· ${yUnit}`}
            </div>
            {visible.map((item) => (
              <div key={item.key} className="row row--tight" style={{ justifyContent: 'space-between', fontSize: 11.5 }}>
                <span className="row row--tight">
                  <span className="chart-legend__swatch" style={{ background: item.color, width: 8, height: 8 }} />
                  {item.label}
                </span>
                <span className="mono">{(item.values[hover] ?? 0).toFixed(1)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function BarChart({
  data,
  height = 210,
  color = '#22d3ee',
  colorBy,
  valueFormat = (value: number) => value.toFixed(0),
  xTitle,
  yTitle,
  horizontal = false,
  labelWidth = 118,
}: {
  data: { label: string; value: number; color?: string; hint?: string }[];
  height?: number;
  color?: string;
  colorBy?: (value: number, index: number) => string;
  valueFormat?: (value: number) => string;
  xTitle?: string;
  yTitle?: string;
  horizontal?: boolean;
  labelWidth?: number;
}) {
  const { ref, width } = useChartSize(height);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((row) => row.value));

  if (horizontal) {
    const rowHeight = Math.max(22, Math.min(38, (height - 24) / Math.max(1, data.length)));
    const plotW = width - labelWidth - 62;
    return (
      <div ref={ref} style={{ width: '100%' }}>
        <svg className="chart" width={width} height={data.length * rowHeight + 12}>
          {data.map((row, index) => {
            const y = index * rowHeight + 6;
            const barColor = row.color ?? colorBy?.(row.value, index) ?? color;
            const barWidth = Math.max(2, (row.value / max) * plotW);
            return (
              <g
                key={row.label}
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
                opacity={hover === null || hover === index ? 1 : 0.6}
              >
                <text className="axis-label" x={labelWidth - 8} y={y + rowHeight / 2 + 3.5} textAnchor="end" style={{ fontSize: 11 }}>
                  {row.label.length > 22 ? `${row.label.slice(0, 21)}…` : row.label}
                </text>
                <rect x={labelWidth} y={y + rowHeight / 2 - 8} width={plotW} height={16} rx={5} fill="rgba(122,176,224,.1)" />
                <rect
                  x={labelWidth}
                  y={y + rowHeight / 2 - 8}
                  width={barWidth}
                  height={16}
                  rx={5}
                  fill={barColor}
                  opacity={0.9}
                  style={{ transition: 'width .6s var(--ease)' }}
                />
                <text className="axis-label" x={labelWidth + barWidth + 8} y={y + rowHeight / 2 + 3.5} style={{ fontSize: 11, fill: 'var(--text-dim)' }}>
                  {valueFormat(row.value)}
                </text>
              </g>
            );
          })}
        </svg>
        {hover !== null && data[hover]?.hint && (
          <div className="t-xs t-mute" style={{ marginTop: 6 }}>{data[hover].hint}</div>
        )}
      </div>
    );
  }

  const chartHeight = height;
  const plotW = width - PAD.left - PAD.right;
  const plotH = chartHeight - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, data.length);
  const barWidth = Math.min(46, slot * 0.62);
  const gridValues = ticks(0, max, 4);
  const ys = (value: number) => PAD.top + plotH - (value / max) * plotH;

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg className="chart" width={width} height={chartHeight}>
        {gridValues.map((value) => (
          <g key={value}>
            <line className="grid-line" x1={PAD.left} x2={PAD.left + plotW} y1={ys(value)} y2={ys(value)} />
            <text className="axis-label" x={PAD.left - 8} y={ys(value) + 3.5} textAnchor="end">
              {value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0)}
            </text>
          </g>
        ))}
        {data.map((row, index) => {
          const x = PAD.left + slot * index + (slot - barWidth) / 2;
          const barColor = row.color ?? colorBy?.(row.value, index) ?? color;
          const barHeight = Math.max(2, (row.value / max) * plotH);
          return (
            <g key={`${row.label}-${index}`} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)}>
              <rect
                x={x}
                y={PAD.top + plotH - barHeight}
                width={barWidth}
                height={barHeight}
                rx={5}
                fill={barColor}
                opacity={hover === null || hover === index ? 0.92 : 0.5}
                style={{ transition: 'opacity .18s var(--ease)' }}
              />
              <text className="axis-label" x={x + barWidth / 2} y={chartHeight - 12} textAnchor="middle">
                {row.label.length > 9 ? `${row.label.slice(0, 8)}…` : row.label}
              </text>
            </g>
          );
        })}
        {xTitle && (
          <text className="axis-label" x={PAD.left + plotW / 2} y={chartHeight - 1} textAnchor="middle">{xTitle}</text>
        )}
        {yTitle && (
          <text className="axis-label" transform={`translate(11 ${PAD.top + plotH / 2}) rotate(-90)`} textAnchor="middle">
            {yTitle}
          </text>
        )}
      </svg>
      {hover !== null && (
        <div className="t-xs t-dim" style={{ marginTop: 4 }}>
          <span className="mono">{data[hover].label}</span> — {valueFormat(data[hover].value)}
          {data[hover].hint ? ` · ${data[hover].hint}` : ''}
        </div>
      )}
    </div>
  );
}

export function StackedBarChart({
  rows,
  keys,
  height = 250,
  xTitle,
  onSelect,
  activeKey,
}: {
  rows: ({ label: string } & Record<string, number | string>)[];
  keys: { key: string; label: string; color: string }[];
  height?: number;
  xTitle?: string;
  onSelect?: (key: string) => void;
  activeKey?: string;
}) {
  const { ref, width } = useChartSize(height);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const visibleKeys = keys.filter((item) => !hidden[item.key]);
  const totals = rows.map((row) => visibleKeys.reduce((sum, item) => sum + (Number(row[item.key]) || 0), 0));
  const max = Math.max(1, ...totals);
  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, rows.length);
  const barWidth = Math.min(52, slot * 0.66);

  return (
    <div ref={ref} style={{ width: '100%' }}>
      <div className="chart-legend">
        {keys.map((item) => (
          <span
            key={item.key}
            className="chart-legend__item"
            data-off={hidden[item.key] ? 'true' : 'false'}
            onClick={() => setHidden((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
          >
            <span className="chart-legend__swatch" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <svg className="chart" width={width} height={height}>
        {ticks(0, max, 4).map((value) => {
          const y = PAD.top + plotH - (value / max) * plotH;
          return (
            <g key={value}>
              <line className="grid-line" x1={PAD.left} x2={PAD.left + plotW} y1={y} y2={y} />
              <text className="axis-label" x={PAD.left - 8} y={y + 3.5} textAnchor="end">{value.toFixed(0)}</text>
            </g>
          );
        })}
        {rows.map((row, index) => {
          const x = PAD.left + slot * index + (slot - barWidth) / 2;
          let cursor = PAD.top + plotH;
          return (
            <g key={row.label}>
              {visibleKeys.map((item) => {
                const value = Number(row[item.key]) || 0;
                if (value <= 0) return null;
                const barHeight = (value / max) * plotH;
                cursor -= barHeight;
                return (
                  <rect
                    key={item.key}
                    x={x}
                    y={cursor}
                    width={barWidth}
                    height={Math.max(1, barHeight)}
                    fill={item.color}
                    opacity={activeKey && activeKey !== item.key ? 0.55 : 0.92}
                    onClick={() => onSelect?.(item.key)}
                    style={{ cursor: onSelect ? 'pointer' : 'default' }}
                  >
                    <title>{`${row.label} · ${item.label}: ${value}`}</title>
                  </rect>
                );
              })}
              <text className="axis-label" x={x + barWidth / 2} y={height - 12} textAnchor="middle">
                {row.label.length > 11 ? `${row.label.slice(0, 10)}…` : row.label}
              </text>
            </g>
          );
        })}
        {xTitle && <text className="axis-label" x={PAD.left + plotW / 2} y={height - 1} textAnchor="middle">{xTitle}</text>}
      </svg>
    </div>
  );
}

export function Donut({
  data,
  size = 168,
  thickness = 22,
  center,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  center?: ReactNode;
}) {
  const total = Math.max(1, data.reduce((sum, row) => sum + row.value, 0));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(122,176,224,.13)" strokeWidth={thickness} />
          {data.map((row) => {
            const length = (row.value / total) * circumference;
            const element = (
              <circle
                key={row.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={row.color}
                strokeWidth={thickness}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              >
                <title>{`${row.label}: ${row.value}`}</title>
              </circle>
            );
            offset += length;
            return element;
          })}
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
          }}
        >
          {center}
        </div>
      </div>
      <div className="stack-list" style={{ flex: 1, minWidth: 140 }}>
        {data.map((row) => (
          <div key={row.label} className="row row--tight" style={{ justifyContent: 'space-between', fontSize: 12.4 }}>
            <span className="row row--tight">
              <span className="chart-legend__swatch" style={{ background: row.color }} />
              {row.label}
            </span>
            <span className="mono t-dim">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Arc spanning ±confidence/2 around a probability, drawn inside the dial. */
function confidenceArc(cx0: number, cy0: number, radius: number, fraction: number, confidence: number): string {
  const half = confidence / 200;
  const from = Math.max(0, fraction - half);
  const to = Math.min(1, fraction + half);
  const point = (f: number) => ({
    x: cx0 + radius * Math.cos(Math.PI * (1 - f)),
    y: cy0 - radius * Math.sin(Math.PI * (1 - f)),
  });
  const start = point(from);
  const end = point(to);
  return `M${start.x.toFixed(2)},${start.y.toFixed(2)} A${radius},${radius} 0 0 1 ${end.x.toFixed(2)},${end.y.toFixed(2)}`;
}

/** Semicircular hazard gauge with a probability dial and confidence whisker. */
export function Gauge({
  value,
  confidence,
  color = '#22d3ee',
  label,
  size = 168,
  caption,
}: {
  value: number;
  confidence?: number;
  color?: string;
  label?: string;
  size?: number;
  caption?: string;
}) {
  const height = size * 0.62;
  const radius = size / 2 - 12;
  const cx0 = size / 2;
  const cy0 = height - 6;
  const polar = (fraction: number) => {
    const angle = Math.PI * (1 - fraction);
    return { x: cx0 + radius * Math.cos(angle), y: cy0 - radius * Math.sin(angle) };
  };
  const arc = (from: number, to: number) => {
    const start = polar(from);
    const end = polar(to);
    return `M${start.x.toFixed(2)},${start.y.toFixed(2)} A${radius},${radius} 0 0 1 ${end.x.toFixed(2)},${end.y.toFixed(2)}`;
  };
  const fraction = Math.max(0, Math.min(1, value / 100));
  const needle = polar(fraction);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ position: 'relative', width: size, height: height + 6 }}>
        <svg width={size} height={height + 6}>
          <path d={arc(0, 1)} fill="none" stroke="rgba(122,176,224,.14)" strokeWidth={12} strokeLinecap="round" />
          <path
            d={arc(0, Math.max(0.001, fraction))}
            fill="none"
            stroke={color}
            strokeWidth={12}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 9px ${color}88)`, transition: 'all .6s var(--ease)' }}
          />
          {[0, 0.5, 1].map((mark) => {
            const point = polar(mark);
            const inner = {
              x: cx0 + (radius - 15) * Math.cos(Math.PI * (1 - mark)),
              y: cy0 - (radius - 15) * Math.sin(Math.PI * (1 - mark)),
            };
            return <line key={mark} x1={inner.x} y1={inner.y} x2={point.x} y2={point.y} stroke="rgba(122,176,224,.3)" strokeWidth={1.4} />;
          })}
          <line x1={cx0} y1={cy0} x2={needle.x} y2={needle.y} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
          <circle cx={cx0} cy={cy0} r={4.6} fill={color} />
          {confidence !== undefined && (
            <path
              d={confidenceArc(cx0, cy0, radius - 21, fraction, confidence)}
              fill="none"
              stroke="rgba(232,241,251,.44)"
              strokeWidth={4}
              strokeLinecap="round"
            />
          )}
        </svg>
        <div className="gauge__value" style={{ top: 6 }}>
          <span className="gauge__number" style={{ color }}>{value.toFixed(0)}%</span>
          {caption && <span className="gauge__caption">{caption}</span>}
        </div>
      </div>
      {label && <span className="t-sm t-dim t-center">{label}</span>}
    </div>
  );
}

export function ScoreRing({
  value,
  size = 152,
  thickness = 13,
  color = '#22d3ee',
  label,
  sub,
}: {
  value: number;
  size?: number;
  thickness?: number;
  color?: string;
  label?: string;
  sub?: string;
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.max(0, Math.min(1, value / 100));
  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(122,176,224,.14)" strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${circumference * fraction} ${circumference}`}
          style={{ filter: `drop-shadow(0 0 10px ${color}99)`, transition: 'stroke-dasharray .9s var(--ease)' }}
        />
      </svg>
      <div className="score-ring__inner">
        <span className="score-ring__value" style={{ color }}>{value.toFixed(0)}</span>
        {label && <span className="gauge__caption">{label}</span>}
        {sub && <span className="t-xs t-mute">{sub}</span>}
      </div>
    </div>
  );
}

/** A compact inline sparkline for KPI cards. */
export function Sparkline({
  values,
  color = '#22d3ee',
  height = 34,
  width = 120,
  fill = true,
}: {
  values: number[];
  color?: string;
  height?: number;
  width?: number;
  fill?: boolean;
}) {
  if (values.length < 2) return <div style={{ height }} />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(1e-6, max - min);
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 6) - 3;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return (
    <svg width={width} height={height} className="chart" style={{ overflow: 'visible' }} aria-hidden="true">
      {fill && <polygon points={`0,${height} ${points.join(' ')} ${width},${height}`} fill={color} opacity={0.16} />}
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={width} cy={Number(points[points.length - 1].split(',')[1])} r={2.8} fill={color} />
    </svg>
  );
}

/** Vertical depth column — a heat strip of banded risk, deepest at the top. */
export function DepthHeatStrip({
  bands,
  activeDepth,
  onSelect,
  height = 340,
}: {
  bands: { depth: number; band: string; weighted: number; formation: string; hazards: Record<string, number> }[];
  activeDepth?: number;
  onSelect?: (depth: number) => void;
  height?: number;
}) {
  const ordered = useMemo(() => [...bands].sort((a, b) => b.depth - a.depth), [bands]);
  const [hover, setHover] = useState<number | null>(null);
  const rowHeight = Math.max(9, Math.min(24, height / Math.max(1, ordered.length)));

  const colorOf = (band: string) => {
    if (band === 'CRITICAL') return '#ef4444';
    if (band === 'HIGH') return '#f97316';
    if (band === 'MODERATE') return '#f59e0b';
    return '#22c55e';
  };

  return (
    <div>
      <div className="depth-strip" style={{ maxHeight: height, overflowY: 'auto' }}>
        {ordered.map((row) => {
          const isActive =
            activeDepth !== undefined && Math.abs(row.depth - Math.floor(activeDepth / 100) * 100) < 50;
          return (
            <div
              key={row.depth}
              className={cx('depth-strip__row', isActive && 'depth-strip__row--active')}
              onMouseEnter={() => setHover(row.depth)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect?.(row.depth)}
              style={{ minHeight: rowHeight }}
            >
              <span className="mono t-sm">{row.depth.toFixed(0)} m</span>
              <span className={cx('chip', row.band === 'MODERATE' ? 'chip--moderate' : `chip--${row.band.toLowerCase()}`, 'chip--sm')}>
                {row.band}
              </span>
              <span
                className="meter"
                style={{ height: 8 }}
                title={Object.entries(row.hazards).map(([key, value]) => `${key}: ${value}%`).join('  ')}
              >
                <span
                  className="meter__fill"
                  style={{ width: `${Math.min(100, row.weighted)}%`, background: colorOf(row.band) }}
                />
              </span>
              <span className="mono t-xs t-dim t-right">{row.weighted.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
      {hover !== null && (
        <div className="t-xs t-mute" style={{ marginTop: 6 }}>
          {ordered.find((row) => row.depth === hover)?.formation}
        </div>
      )}
    </div>
  );
}
