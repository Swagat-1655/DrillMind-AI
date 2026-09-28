import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import { Circle, CircleMarker, LayerGroup, MapContainer, Marker, Polyline, Popup, ScaleControl, TileLayer, Tooltip, useMap } from 'react-leaflet';
import {
  AsyncBoundary,
  BandChip,
  GlassCard,
  Icon,
  KeyValue,
  Modal,
  OutcomeChip,
  SectionHead,
  Segmented,
  SeverityChip,
  StatusChip,
} from '../components/ui';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import {
  HAZARD_COLOR,
  STATUS_COLOR,
  compact,
  cx,
  depth as fmtDepth,
  formatDate,
  num,
  pct,
  scoreColor,
  usd,
} from '../lib/format';
import { useAsync, useDebounced } from '../lib/hooks';
import type { WellSummary } from '../lib/types';
import { useApp } from '../store';

type Basemap = 'satellite' | 'terrain';

const BASEMAPS: Record<Basemap, { url: string; attribution: string; subdomains?: string; label: string }> = {
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
    label: 'Satellite',
  },
  terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data &copy; OpenStreetMap contributors, SRTM · style &copy; OpenTopoMap',
    subdomains: 'abc',
    label: 'Terrain',
  },
};

export default function WellsMap() {
  const { t, isHindi } = useI18n();
  const { wells, wellsLoading, wellsError, refreshWells, focusWellId, setFocusWellId } = useApp();
  const [params, setParams] = useSearchParams();

  const [basemap, setBasemap] = useState<Basemap>('satellite');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ACTIVE' | 'HISTORICAL' | 'RISK' | 'CRITICAL'>('all');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query);
  const [radiusKm, setRadiusKm] = useState(25);
  const [overlays, setOverlays] = useState({
    geology: false,
    formation: false,
    risk: true,
    reservoir: false,
    similar: true,
    trajectory: true,
  });
  const [selected, setSelected] = useState<string | null>(params.get('well'));
  const [detailOpen, setDetailOpen] = useState(false);

  const selectedId = selected ?? focusWellId;
  const detail = useAsync(
    (signal) => (detailOpen && selectedId ? api.well(selectedId, signal) : Promise.resolve(null)),
    [detailOpen, selectedId],
  );
  const similar = useAsync(
    (signal) => (selectedId ? api.similar(selectedId, 8, signal) : Promise.resolve(null)),
    [selectedId],
  );

  const focusWell = useMemo(() => wells.find((well) => well.id === selectedId) ?? null, [wells, selectedId]);

  const filtered = useMemo(() => {
    const needle = debouncedQuery.trim().toLowerCase();
    return wells.filter((well) => {
      if (statusFilter !== 'all' && well.status !== statusFilter) return false;
      if (!needle) return true;
      return (
        well.name.toLowerCase().includes(needle) ||
        well.field.toLowerCase().includes(needle) ||
        well.formation.toLowerCase().includes(needle) ||
        well.operator.toLowerCase().includes(needle)
      );
    });
  }, [wells, statusFilter, debouncedQuery]);

  // Wells within the search radius of the focus well.
  const nearbyIds = useMemo(() => {
    if (!focusWell) return new Set<string>();
    const set = new Set<string>();
    for (const well of wells) {
      const dLat = (well.lat - focusWell.lat) * 111;
      const dLon = (well.lon - focusWell.lon) * 100;
      if (Math.hypot(dLat, dLon) <= radiusKm) set.add(well.id);
    }
    return set;
  }, [wells, focusWell, radiusKm]);

  const similarIds = useMemo(
    () => new Set((similar.data?.matches ?? []).map((match) => match.wellId)),
    [similar.data],
  );

  const openWell = (id: string) => {
    setSelected(id);
    setFocusWellId(id);
    setDetailOpen(true);
    setParams({ well: id }, { replace: true });
  };

  useEffect(() => {
    const fromUrl = params.get('well');
    if (fromUrl && fromUrl !== selected) {
      setSelected(fromUrl);
      setFocusWellId(fromUrl);
      setDetailOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const fieldGroups = useMemo(() => {
    const map = new Map<string, WellSummary[]>();
    for (const well of filtered) {
      const list = map.get(well.field);
      if (list) list.push(well);
      else map.set(well.field, [well]);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="stack-list" style={{ gap: 14 }}>
      {/* -------------------------------------------------------- toolbar */}
      <GlassCard>
        <div className="row" style={{ gap: 14, justifyContent: 'space-between' }}>
          <div className="row" style={{ gap: 10 }}>
            <div className="search" style={{ width: 230 }}>
              <Icon name="search" size={14} />
              <input
                className="input"
                value={query}
                placeholder={`${t('common.search')} wells, fields…`}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Segmented
              options={[
                { value: 'all', label: t('common.all') },
                { value: 'ACTIVE', label: 'Active' },
                { value: 'HISTORICAL', label: 'Historical' },
                { value: 'RISK', label: 'Risk' },
                { value: 'CRITICAL', label: 'Critical' },
              ]}
              value={statusFilter}
              onChange={setStatusFilter}
              size="sm"
            />
          </div>

          <div className="row" style={{ gap: 16 }}>
            <label className="field" style={{ minWidth: 168 }}>
              <span className="t-label">{t('map.radius')} · {radiusKm} km</span>
              <input
                className="slider"
                type="range"
                min={5}
                max={80}
                step={5}
                value={radiusKm}
                onChange={(event) => setRadiusKm(Number(event.target.value))}
              />
            </label>
            <div className="row row--tight">
              <span className="t-label">{t('map.layers')}</span>
              <Segmented
                options={(
                  [
                    { value: 'satellite', label: t('map.layer.satellite') },
                    { value: 'terrain', label: t('map.layer.terrain') },
                  ] as { value: Basemap; label: string }[]
                )}
                value={basemap}
                onChange={setBasemap}
                size="sm"
              />
            </div>
          </div>
        </div>

        <div className="row" style={{ gap: 7, marginTop: 12 }}>
          {(
            [
              ['geology', t('map.layer.geology')],
              ['formation', t('map.layer.formation')],
              ['risk', t('map.layer.risk')],
              ['reservoir', t('map.layer.reservoir')],
              ['similar', t('map.similarWell')],
              ['trajectory', t('dashboard.trajectoryTitle')],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={cx('btn', 'btn--sm', overlays[key] ? 'btn--primary' : 'btn--ghost')}
              onClick={() => setOverlays((prev) => ({ ...prev, [key]: !prev[key] }))}
            >
              <Icon name={overlays[key] ? 'check' : 'layers'} size={12} /> {label}
            </button>
          ))}
          <span className="spacer" />
          <button type="button" className="btn btn--sm btn--ghost" onClick={refreshWells}>
            <Icon name="refresh" size={12} /> {t('common.refresh')}
          </button>
        </div>
      </GlassCard>

      {/* ------------------------------------------------------------ map */}
      <div className="map-shell" style={{ position: 'relative', height: 'min(720px, calc(100vh - 288px))', minHeight: 480 }}>
        <AsyncBoundary loading={wellsLoading} error={wellsError} onRetry={refreshWells}>
          <MapContainer
            center={[26.6, 93.4]}
            zoom={6}
            scrollWheelZoom
            className="map-canvas"
            worldCopyJump
            preferCanvas={false}
          >
            <TileLayer
              url={BASEMAPS[basemap].url}
              attribution={BASEMAPS[basemap].attribution}
              subdomains={BASEMAPS[basemap].subdomains ?? 'abc'}
              maxZoom={19}
            />
            <ScaleControl position="bottomright" imperial={false} />
            <FocusCamera wells={filtered} focus={focusWell} />

            {/* Geological / reservoir overlays */}
            {overlays.geology && (
              <LayerGroup>
                {fieldGroups.map(([field, group]) => {
                  const events = group.reduce((sum, well) => sum + well.eventCount, 0);
                  const lat = group.reduce((sum, well) => sum + well.lat, 0) / group.length;
                  const lon = group.reduce((sum, well) => sum + well.lon, 0) / group.length;
                  return (
                    <Circle
                      key={`geo-${field}`}
                      center={[lat, lon]}
                      radius={Math.min(16000, 2600 + events * 55)}
                      pathOptions={{
                        color: '#a78bfa',
                        weight: 1.2,
                        opacity: 0.6,
                        fillColor: '#a78bfa',
                        fillOpacity: 0.09,
                        dashArray: '5 6',
                      }}
                    >
                      <Tooltip sticky>
                        <strong>{field}</strong> geological envelope · {events} recorded events
                      </Tooltip>
                    </Circle>
                  );
                })}
              </LayerGroup>
            )}

            {overlays.reservoir && (
              <LayerGroup>
                {fieldGroups.map(([field, group]) => {
                  const lat = group.reduce((sum, well) => sum + well.lat, 0) / group.length;
                  const lon = group.reduce((sum, well) => sum + well.lon, 0) / group.length;
                  const reservoirs = [...new Set(group.map((well) => well.reservoir))];
                  return (
                    <CircleMarker
                      key={`res-${field}`}
                      center={[lat, lon]}
                      radius={13}
                      pathOptions={{ color: '#10b981', weight: 1.6, opacity: 0.85, fillColor: '#10b981', fillOpacity: 0.16 }}
                    >
                      <Tooltip sticky>
                        <strong>{field}</strong> reservoirs: {reservoirs.slice(0, 3).join(', ')}
                      </Tooltip>
                    </CircleMarker>
                  );
                })}
              </LayerGroup>
            )}

            {overlays.formation && (
              <LayerGroup>
                {fieldGroups.map(([field, group]) => {
                  const lat = group.reduce((sum, well) => sum + well.lat, 0) / group.length;
                  const lon = group.reduce((sum, well) => sum + well.lon, 0) / group.length;
                  const counts = new Map<string, number>();
                  group.forEach((well) => counts.set(well.formation, (counts.get(well.formation) ?? 0) + 1));
                  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
                  return (
                    <CircleMarker
                      key={`fm-${field}`}
                      center={[lat, lon]}
                      radius={9}
                      pathOptions={{ color: '#22d3ee', weight: 1.4, opacity: 0.8, fillColor: '#0e7490', fillOpacity: 0.3 }}
                    >
                      <Tooltip sticky>
                        <strong>{field}</strong> · dominant formation {top?.[0]} ({top?.[1]} wells)
                      </Tooltip>
                    </CircleMarker>
                  );
                })}
              </LayerGroup>
            )}

            {overlays.risk && (
              <LayerGroup>
                {filtered.map((well) => (
                  <Circle
                    key={`risk-${well.id}`}
                    center={[well.lat, well.lon]}
                    radius={900 + well.riskScore * 62}
                    pathOptions={{
                      color: scoreColor(well.riskScore),
                      weight: 1,
                      opacity: 0.42,
                      fillColor: scoreColor(well.riskScore),
                      fillOpacity: 0.1,
                    }}
                  />
                ))}
              </LayerGroup>
            )}

            {/* Trajectories (plan view) */}
            {overlays.trajectory && (
              <LayerGroup>
                {filtered.map((well) => {
                  const lengthKm = Math.max(1.2, well.totalDepthMd / 1000) * (well.isDeviated ? 0.55 : 0.14);
                  const heading = ((well.name.charCodeAt(well.name.length - 1) * 37) % 360) * (Math.PI / 180);
                  const endLat = well.lat + (Math.cos(heading) * lengthKm) / 111;
                  const endLon = well.lon + (Math.sin(heading) * lengthKm) / 100;
                  return (
                    <Polyline
                      key={`tr-${well.id}`}
                      positions={[
                        [well.lat, well.lon],
                        [endLat, endLon],
                      ]}
                      pathOptions={{
                        color: well.isDeviated ? '#f59e0b' : '#64748b',
                        weight: well.status === 'ACTIVE' ? 2.1 : 1.2,
                        opacity: well.status === 'ACTIVE' ? 0.9 : 0.4,
                        dashArray: well.isDeviated ? undefined : '3 5',
                      }}
                    />
                  );
                })}
              </LayerGroup>
            )}

            {/* Similar wells halo */}
            {overlays.similar &&
              [...similarIds].map((id) => {
                const well = wells.find((item) => item.id === id);
                if (!well) return null;
                return (
                  <Circle
                    key={`sim-${id}`}
                    center={[well.lat, well.lon]}
                    radius={3400}
                    pathOptions={{ color: '#a78bfa', weight: 1.6, opacity: 0.85, fillColor: '#a78bfa', fillOpacity: 0.06, dashArray: '4 4' }}
                  />
                );
              })}

            {/* Well markers */}
            <LayerGroup>
              {filtered.map((well) => {
                const highlight = well.id === selectedId;
                const isSimilar = similarIds.has(well.id);
                const inRadius = nearbyIds.has(well.id);
                const size = highlight ? 30 : well.status === 'ACTIVE' ? 20 : 15;
                const icon = L.divIcon({
                  className: '',
                  iconSize: [size, size],
                  iconAnchor: [size / 2, size / 2],
                  html: `<span class="well-marker ${well.status === 'ACTIVE' ? 'well-marker--active' : ''}"
                    style="--marker-color:${isSimilar ? '#a78bfa' : STATUS_COLOR[well.status]};
                           width:${size}px;height:${size}px;
                           opacity:${inRadius || !focusWell ? 1 : 0.42};
                           box-shadow:0 0 0 ${highlight ? 8 : 4}px ${(isSimilar ? '#a78bfa' : STATUS_COLOR[well.status])}44, 0 6px 18px rgba(0,0,0,.5);
                           border:2px solid ${highlight ? '#ffffff' : 'rgba(255,255,255,.8)'};">
                    ${well.status === 'CRITICAL' ? '<svg width="9" height="9" viewBox="0 0 24 24" fill="#fff"><path d="M12 2 2 20h20z"/></svg>' : ''}
                  </span>`,
                });
                return (
                  <Marker
                    key={well.id}
                    position={[well.lat, well.lon]}
                    icon={icon}
                    eventHandlers={{ click: () => openWell(well.id) }}
                  >
                    <Tooltip direction="top" offset={[0, -12]} opacity={0.95}>
                      <strong>{well.name}</strong>
                      <br />
                      {well.field} · {well.formation}
                      <br />
                      {fmtDepth(well.currentDepthMd)} of {fmtDepth(well.totalDepthMd)}
                      <br />
                      risk {pct(well.riskScore)} · {well.eventCount} events
                    </Tooltip>
                    <Popup>
                      <div style={{ minWidth: 228 }}>
                        <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 3 }}>{well.name}</div>
                        <div className="t-xs" style={{ color: '#8ba3bd', marginBottom: 9 }}>
                          {well.operator} · {well.field} · {well.basin}
                        </div>
                        <div style={{ fontSize: 11.5, lineHeight: 1.75 }}>
                          <div>Formation: {well.formation}</div>
                          <div>Total depth: {fmtDepth(well.totalDepthMd)}</div>
                          <div>Mud weight: {well.mudWeight.toFixed(2)} ppg</div>
                          <div>Events: {well.eventCount} ({well.criticalEventCount} critical)</div>
                          <div>Offset risk: {pct(well.riskScore)}</div>
                        </div>
                        <button
                          type="button"
                          className="btn btn--sm btn--primary"
                          style={{ marginTop: 10, width: '100%' }}
                          onClick={() => openWell(well.id)}
                        >
                          Open intelligence record
                        </button>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </LayerGroup>
          </MapContainer>
        </AsyncBoundary>

        {/* ------------------------------------------------------ overlays */}
        <div className="map-overlay map-overlay--tl">
          <div className="map-panel">
            <div className="t-label" style={{ marginBottom: 8 }}>{t('map.legend')}</div>
            <div className="map-legend">
              {(
                [
                  ['active', t('map.activeWell')],
                  ['historical', t('map.historicalWell')],
                  ['risk', t('map.riskWell')],
                  ['critical', t('map.criticalWell')],
                  ['similar', t('map.similarWell')],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="map-legend__row">
                  <span className={cx('legend-marker', `legend-marker--${key}`)} />
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div className="map-panel">
            <div className="t-label" style={{ marginBottom: 7 }}>Risk band</div>
            <div className="map-legend">
              {(['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] as const).map((band) => (
                <div key={band} className="map-legend__row">
                  <span className="legend-marker" style={{ background: scoreColor(band === 'CRITICAL' ? 90 : band === 'HIGH' ? 70 : band === 'MODERATE' ? 45 : 20), color: scoreColor(band === 'CRITICAL' ? 90 : band === 'HIGH' ? 70 : band === 'MODERATE' ? 45 : 20) }} />
                  {band}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="map-overlay map-overlay--tr">
          <div className="map-panel" style={{ minWidth: 214 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="t-label">{t('map.wellsInView')}</span>
              <span className="mono" style={{ color: '#22d3ee' }}>{filtered.length}</span>
            </div>
            <div className="divider" style={{ margin: '8px 0' }} />
            {focusWell && (
              <div className="stack-list" style={{ gap: 5 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="t-xs t-mute">{t('common.focusWell')}</span>
                  <span className="t-xs mono">{focusWell.name}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="t-xs t-mute">Inside {radiusKm} km</span>
                  <span className="t-xs mono" style={{ color: '#22d3ee' }}>{nearbyIds.size}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="t-xs t-mute">{t('common.similar')}</span>
                  <span className="t-xs mono" style={{ color: '#a78bfa' }}>{similarIds.size}</span>
                </div>
              </div>
            )}
            <div className="divider" style={{ margin: '8px 0' }} />
            <button type="button" className="btn btn--sm btn--primary btn--block" onClick={() => setDetailOpen(true)} disabled={!focusWell}>
              <Icon name="eye" size={12} /> {focusWell ? 'Open record' : 'Select a well'}
            </button>
          </div>
        </div>

        <div className="map-overlay map-overlay--bl">
          <span className="hud-pill">
            <Icon name="pin" size={12} style={{ color: '#22d3ee' }} />
            {t('map.hint')}
          </span>
        </div>
      </div>

      {/* --------------------------------------------------- selection card */}
      {focusWell && (
        <div className="grid grid--split-wide">
          <GlassCard>
            <SectionHead
              icon="target"
              title={focusWell.name}
              hint={`${focusWell.operator} · ${focusWell.field} · ${focusWell.basin} · ${focusWell.wellType}`}
              actions={
                <>
                  <StatusChip status={focusWell.status} />
                  <BandChip band={focusWell.riskBand} />
                  <button type="button" className="btn btn--sm" onClick={() => setDetailOpen(true)}>
                    <Icon name="eye" size={12} /> {t('common.open')}
                  </button>
                </>
              }
            />
            <div className="grid grid--4" style={{ marginTop: 14, gap: 10 }}>
              {[
                ['Latitude', focusWell.lat.toFixed(5)],
                ['Longitude', focusWell.lon.toFixed(5)],
                ['Current depth', fmtDepth(focusWell.currentDepthMd)],
                ['Total depth', fmtDepth(focusWell.totalDepthMd)],
                ['Mud weight', `${focusWell.mudWeight.toFixed(2)} ppg`],
                ['Inclination', `${focusWell.targetInclination.toFixed(1)}°`],
                ['Events', `${focusWell.eventCount} (${focusWell.criticalEventCount} critical)`],
                ['NPT cost', usd(focusWell.totalCostUsd)],
              ].map(([label, value]) => (
                <div key={label} className="glass" style={{ padding: '9px 11px' }}>
                  <div className="t-label" style={{ fontSize: 9.6 }}>{label}</div>
                  <div className="mono t-sm">{value}</div>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard>
            <SectionHead
              icon="similarity"
              title={isHindi ? 'सबसे समान निकटवर्ती कुएँ' : 'Closest analogues'}
              hint="AI Similarity Engine"
            />
            <div className="stack-list" style={{ marginTop: 12 }}>
              {(similar.data?.matches ?? []).slice(0, 5).map((match) => (
                <button
                  key={match.wellId}
                  type="button"
                  className="row"
                  style={{ justifyContent: 'space-between', width: '100%', background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left' }}
                  onClick={() => openWell(match.wellId)}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12.8, fontWeight: 620 }}>{match.name}</span>
                    <span className="t-xs t-mute">{match.field} · {match.formation}</span>
                  </span>
                  <span className="mono" style={{ color: '#a78bfa', fontSize: 15 }}>{match.similarity.toFixed(0)}%</span>
                </button>
              ))}
              {(similar.data?.matches ?? []).length === 0 && <span className="t-sm t-mute">No analogues computed yet.</span>}
            </div>
          </GlassCard>
        </div>
      )}

      {/* ---------------------------------------------------------- modal */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        wide
        title={detail.data?.name ?? focusWell?.name ?? 'Well record'}
        subtitle={
          detail.data
            ? `${detail.data.operator} · ${detail.data.field} · ${detail.data.basin} basin · ${detail.data.state}`
            : 'Loading well record…'
        }
        actions={
          detail.data && (
            <>
              <StatusChip status={detail.data.status} />
              <BandChip band={detail.data.riskBand} />
            </>
          )
        }
      >
        <AsyncBoundary loading={detail.loading} error={detail.error} onRetry={detail.reload}>
          {detail.data && (
            <>
              <div className="grid grid--4" style={{ gap: 10 }}>
                {[
                  ['Well ID', detail.data.id],
                  ['Spud date', formatDate(detail.data.spudDate)],
                  ['Completion', detail.data.completionDate ? formatDate(detail.data.completionDate) : 'Drilling'],
                  ['Coordinates', `${detail.data.lat.toFixed(4)}, ${detail.data.lon.toFixed(4)}`],
                  ['Current depth', fmtDepth(detail.data.currentDepthMd)],
                  ['Total depth', fmtDepth(detail.data.totalDepthMd)],
                  ['Formation', detail.data.formation],
                  ['Reservoir', detail.data.reservoir],
                  ['Mud weight', `${detail.data.mudWeight.toFixed(2)} ppg`],
                  ['Pore pressure', `${detail.data.poreEmw.toFixed(2)} ppg eq`],
                  ['Fracture gradient', `${detail.data.fracEmw.toFixed(2)} ppg eq`],
                  ['Risk score', `${pct(detail.data.riskScore)} (${detail.data.riskBand})`],
                ].map(([label, value]) => (
                  <div key={label} className="glass" style={{ padding: '9px 11px' }}>
                    <div className="t-label" style={{ fontSize: 9.6 }}>{label}</div>
                    <div className="mono t-sm">{value}</div>
                  </div>
                ))}
              </div>

              <GlassCard>
                <SectionHead icon="risk" title="Current hazard prediction" hint={detail.data.riskSummary.band + ' composite'} />
                <div className="stack-list" style={{ marginTop: 12 }}>
                  {detail.data.riskSummary.predictions.map((prediction) => (
                    <div key={prediction.hazard} className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="row row--tight" style={{ minWidth: 150 }}>
                        <span className="dot" style={{ background: HAZARD_COLOR[prediction.hazard], color: HAZARD_COLOR[prediction.hazard] }} />
                        <span className="t-sm">{prediction.label}</span>
                      </span>
                      <span className="meter" style={{ flex: 1, maxWidth: 300 }}>
                        <span
                          className="meter__fill meter__fill--animated"
                          style={{ width: `${prediction.probabilityPct}%`, background: HAZARD_COLOR[prediction.hazard] }}
                        />
                      </span>
                      <span className="mono t-sm" style={{ width: 48, textAlign: 'right' }}>{prediction.probabilityPct.toFixed(0)}%</span>
                      <BandChip band={prediction.band} sm />
                    </div>
                  ))}
                </div>
                <div className="divider" style={{ margin: '14px 0' }} />
                <span className="t-label">Recommended actions</span>
                <ul className="bullets" style={{ marginTop: 8 }}>
                  {detail.data.riskSummary.actions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </GlassCard>

              <div className="grid grid--2">
                <GlassCard>
                  <SectionHead icon="history" title="Historical events" hint={`${detail.data.events.length} recorded`} />
                  <div className="stack-list" style={{ marginTop: 12, maxHeight: 300, overflowY: 'auto' }}>
                    {detail.data.events.map((event) => (
                      <div key={event.id} className="glass" style={{ padding: '9px 11px' }}>
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <span className="row row--tight">
                            <SeverityChip severity={event.severity} sm />
                            <span className="t-sm" style={{ fontWeight: 620 }}>{event.label}</span>
                          </span>
                          <span className="mono t-xs t-mute">{fmtDepth(event.depth)}</span>
                        </div>
                        <div className="t-xs t-dim" style={{ marginTop: 5 }}>{event.formation} · {formatDate(event.date)}</div>
                        <div className="t-xs t-mute" style={{ marginTop: 5 }}>{event.mitigation}</div>
                        <div className="row row--tight" style={{ marginTop: 7 }}>
                          <OutcomeChip outcome={event.outcome} sm />
                          <span className="t-xs t-mute">{num(event.nptHours)} hr NPT</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassCard>

                <div className="stack-list">
                  <GlassCard>
                    <SectionHead icon="layers" title="Formations penetrated" />
                    <div className="stack-list" style={{ marginTop: 12 }}>
                      {detail.data.formations.map((formation) => (
                        <div key={formation.name} className="row" style={{ justifyContent: 'space-between' }}>
                          <span>
                            <span className="t-sm" style={{ display: 'block', fontWeight: 600 }}>{formation.name}</span>
                            <span className="t-xs t-mute">{formation.lithology}</span>
                          </span>
                          <span className="mono t-xs t-dim nowrap">
                            {formation.topMd.toFixed(0)}–{formation.baseMd.toFixed(0)} m
                          </span>
                        </div>
                      ))}
                    </div>
                  </GlassCard>

                  <GlassCard>
                    <SectionHead icon="book" title="Lessons learned" hint="Transferred from this well" />
                    <ul className="bullets" style={{ marginTop: 10 }}>
                      {detail.data.lessonsLearned.slice(0, 6).map((lesson) => (
                        <li key={`${lesson.eventType}-${lesson.depth}`}>
                          <span className="t-xs" style={{ color: HAZARD_COLOR[lesson.eventType] }}>
                            {fmtDepth(lesson.depth)} {lesson.formation}:
                          </span>{' '}
                          {lesson.text}
                        </li>
                      ))}
                    </ul>
                  </GlassCard>

                  <GlassCard>
                    <SectionHead
                      icon="similarity"
                      title={isHindi ? 'समान कुएँ' : 'Similar wells found'}
                      hint={`${similar.data?.matches.length ?? 0} analogues`}
                    />
                    <div className="stack-list" style={{ marginTop: 12 }}>
                      {(similar.data?.matches ?? []).slice(0, 6).map((match) => (
                        <div key={match.wellId} className="row" style={{ justifyContent: 'space-between' }}>
                          <span className="t-sm">{match.name}</span>
                          <span className="row row--tight">
                            <span className="t-xs t-mute">{compact(match.totalNptHours)} hr NPT</span>
                            <span className="mono t-sm" style={{ color: '#a78bfa' }}>{match.similarity.toFixed(0)}%</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </GlassCard>
                </div>
              </div>

              <GlassCard>
                <SectionHead icon="chart" title="Well header" />
                <div style={{ marginTop: 12 }}>
                  <KeyValue
                    rows={[
                      { label: 'Lithology', value: detail.data.lithology },
                      { label: 'Bottom-hole temperature', value: `${detail.data.bottomHoleTempC.toFixed(1)} °C` },
                      { label: 'Trajectory', value: detail.data.isDeviated ? `${t('common.deviated')} · ${detail.data.targetInclination.toFixed(1)}°` : t('common.vertical') },
                      { label: 'Survey stations', value: num(detail.data.trajectory.length) },
                      { label: 'Total NPT', value: `${num(detail.data.totalNptHours)} hr · ${usd(detail.data.totalCostUsd)}` },
                    ]}
                  />
                </div>
              </GlassCard>
            </>
          )}
        </AsyncBoundary>
      </Modal>
    </div>
  );
}

/** Fits the camera to the filtered set, or flies to the focus well. */
function FocusCamera({ wells, focus }: { wells: WellSummary[]; focus: WellSummary | null }) {
  const map = useMap();

  useEffect(() => {
    if (focus) {
      map.flyTo([focus.lat, focus.lon], Math.max(map.getZoom(), 11), { duration: 0.85 });
      return;
    }
    if (wells.length > 1) {
      const bounds = L.latLngBounds(wells.map((well) => [well.lat, well.lon] as [number, number]));
      map.fitBounds(bounds.pad(0.14), { animate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.id, wells.length]);

  return null;
}
