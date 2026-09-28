import { useState } from 'react';
import { TwinScene } from '../components/scenes';
import { AsyncBoundary, BandChip, Chip, GlassCard, Icon, SectionHead, StatusChip } from '../components/ui';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { HAZARD_SHORT, STATUS_COLOR, cx, depth as fmtDepth, num, pct, scoreColor } from '../lib/format';
import { useAsync } from '../lib/hooks';
import type { Hazard } from '../lib/types';
import { useApp } from '../store';

export default function DigitalTwinPage() {
  const { t } = useI18n();
  const { focusWellId, focusWell } = useApp();
  const focusKey = focusWellId ?? 'auto';

  const [autoRotate, setAutoRotate] = useState(true);
  const [showPlanned, setShowPlanned] = useState(true);
  const [showNearby, setShowNearby] = useState(true);
  const [showRisk, setShowRisk] = useState(true);
  const [highlight, setHighlight] = useState<string | null>(null);

  const twin = useAsync((signal) => api.twin(focusKey, 12, signal), [focusKey]);

  const toggles: { label: string; value: boolean; set: (value: boolean) => void; icon: 'refresh' | 'target' | 'pin' | 'risk' }[] = [
    { label: t('twin.autoRotate'), value: autoRotate, set: setAutoRotate, icon: 'refresh' },
    { label: t('twin.planned'), value: showPlanned, set: setShowPlanned, icon: 'target' },
    { label: t('twin.nearbyWells'), value: showNearby, set: setShowNearby, icon: 'pin' },
    { label: t('twin.riskZones'), value: showRisk, set: setShowRisk, icon: 'risk' },
  ];

  return (
    <div className="stack-list" style={{ gap: 18 }}>
      <GlassCard glow pad={false}>
        <div style={{ padding: '16px 18px 12px' }}>
          <SectionHead
            icon="twin"
            title={t('twin.title')}
            hint={
              twin.data
                ? `${twin.data.activeWell.name} · ${twin.data.activeWell.field} · ${twin.data.activeWell.basin} basin · ${fmtDepth(twin.data.activeWell.totalDepthMd)} TD`
                : t('twin.subtitle')
            }
            actions={
              <>
                {twin.data && <BandChip band={twin.data.activeWell.riskBand} />}
                <Chip className="chip chip--cyan">
                  <Icon name="layers" size={11} /> {twin.data?.formationZones.length ?? 0} zones
                </Chip>
                <Chip className="chip chip--violet">
                  <Icon name="pin" size={11} /> {twin.data?.nearbyWells.length ?? 0} offsets
                </Chip>
              </>
            }
          />
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            {toggles.map((toggle) => (
              <button
                key={toggle.label}
                type="button"
                className={cx('btn', 'btn--sm', toggle.value ? 'btn--primary' : 'btn--ghost')}
                onClick={() => toggle.set(!toggle.value)}
              >
                <Icon name={toggle.icon} size={12} /> {toggle.label}
              </button>
            ))}
            <span className="spacer" />
            <span className="t-xs t-mute">drag to orbit · scroll to zoom</span>
          </div>
        </div>

        <div
          style={{
            position: 'relative',
            height: 'min(680px, calc(100vh - 320px))',
            minHeight: 460,
            borderTop: '1px solid var(--border)',
            background:
              'radial-gradient(circle at 50% 12%, rgba(34,211,238,.12), transparent 58%), linear-gradient(180deg, rgba(6,13,26,.85), rgba(3,7,15,.95))',
          }}
        >
          <AsyncBoundary loading={twin.loading} error={twin.error} onRetry={twin.reload}>
            {twin.data && (
              <TwinScene
                twin={twin.data}
                autoRotate={autoRotate}
                showPlanned={showPlanned}
                showNearby={showNearby}
                showRisk={showRisk}
                highlightZone={highlight}
              />
            )}
          </AsyncBoundary>

          <div className="map-overlay map-overlay--tl">
            <div className="map-panel">
              <div className="t-label" style={{ marginBottom: 8 }}>Legend</div>
              <div className="map-legend">
                <div className="map-legend__row">
                  <span className="legend-marker" style={{ background: '#22d3ee', color: '#22d3ee' }} />
                  {t('twin.actual')}
                </div>
                <div className="map-legend__row">
                  <span className="legend-marker" style={{ background: '#f59e0b', color: '#f59e0b' }} />
                  {t('twin.planned')}
                </div>
                <div className="map-legend__row">
                  <span className="legend-marker" style={{ background: '#ef4444', color: '#ef4444' }} />
                  {t('twin.riskZones')}
                </div>
                <div className="map-legend__row">
                  <span className="legend-marker" style={{ background: '#10b981', color: '#10b981' }} />
                  {t('twin.reservoir')}
                </div>
              </div>
            </div>
          </div>

          {twin.data && (
            <div className="map-overlay map-overlay--tr">
              <div className="map-panel" style={{ minWidth: 200 }}>
                <span className="t-label">{t('common.mudWeight')}</span>
                <div className="mono" style={{ fontSize: 19, color: '#22d3ee' }}>
                  {twin.data.activeWell.mudWeight.toFixed(2)} ppg
                </div>
                <div className="divider" style={{ margin: '8px 0' }} />
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="t-xs t-mute">Pore</span>
                  <span className="mono t-xs">{twin.data.activeWell.poreEmw.toFixed(2)}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="t-xs t-mute">Frac</span>
                  <span className="mono t-xs">{twin.data.activeWell.fracEmw.toFixed(2)}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="t-xs t-mute">Window</span>
                  <span className="mono t-xs" style={{ color: '#f59e0b' }}>
                    {(twin.data.activeWell.fracEmw - twin.data.activeWell.poreEmw).toFixed(2)} ppg
                  </span>
                </div>
                <div className="divider" style={{ margin: '8px 0' }} />
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="t-xs t-mute">Bit depth</span>
                  <span className="mono t-xs">{fmtDepth(twin.data.activeWell.currentDepthMd)}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="t-xs t-mute">Progress</span>
                  <span className="mono t-xs" style={{ color: '#22c55e' }}>
                    {pct((twin.data.activeWell.currentDepthMd / Math.max(1, twin.data.activeWell.totalDepthMd)) * 100)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </GlassCard>

      {/* ------------------------------------------------------------- panels */}
      <div className="grid grid--split">
        <GlassCard>
          <SectionHead
            icon="layers"
            title={t('twin.formationZones')}
            hint="Click a zone to highlight it in the twin"
            actions={
              highlight && (
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => setHighlight(null)}>
                  <Icon name="close" size={12} /> clear
                </button>
              )
            }
          />
          <div className="stack-list" style={{ marginTop: 12 }}>
            {(twin.data?.formationZones ?? []).map((zone) => (
              <button
                key={zone.name}
                type="button"
                onClick={() => setHighlight(zone.name === highlight ? null : zone.name)}
                className={cx('glass', 'glass--pad')}
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  border: `1px solid ${zone.name === highlight ? 'var(--border-glow)' : 'var(--border)'}`,
                  padding: '11px 13px',
                  background: zone.name === highlight ? 'rgba(34,211,238,.08)' : 'var(--surface)',
                }}
              >
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 640, fontSize: 13 }}>{zone.name}</span>
                  <span className="row row--tight">
                    <BandChip band={zone.riskBand} sm />
                    <span className="mono t-xs t-mute">
                      {zone.top.toFixed(0)}–{zone.base.toFixed(0)} m
                    </span>
                  </span>
                </div>
                <div className="t-xs t-mute" style={{ marginTop: 4 }}>{zone.lithology}</div>
                <div className="row row--tight" style={{ marginTop: 8 }}>
                  <Chip className="chip chip--neutral chip--sm" title={HAZARD_SHORT[zone.primaryHazard ?? 'MUDFLOSS']}>
                    {zone.primaryHazard ? HAZARD_SHORT[zone.primaryHazard] : '—'}
                  </Chip>
                  <span className="t-xs t-mute">pore {zone.poreEmw.toFixed(2)} · frac {zone.fracEmw.toFixed(2)} ppg</span>
                  <span className="spacer" />
                  <span className="t-xs" style={{ color: '#a78bfa' }}>{zone.reservoir}</span>
                </div>
              </button>
            ))}
          </div>
        </GlassCard>

        <div className="stack-list">
          <GlassCard>
            <SectionHead
              icon="pin"
              title={t('twin.nearbyWells')}
              hint="Offsets rendered inside the twin, positioned by true surface distance"
            />
            <div className="stack-list" style={{ marginTop: 12, maxHeight: 300, overflowY: 'auto' }}>
              {(twin.data?.nearbyWells ?? []).map((well) => (
                <div key={well.id} className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="row row--tight">
                    <span className="dot" style={{ background: STATUS_COLOR[well.status], color: STATUS_COLOR[well.status] }} />
                    <span>
                      <span style={{ display: 'block', fontSize: 12.6, fontWeight: 600 }}>{well.name}</span>
                      <span className="t-xs t-mute">{well.formation} · {fmtDepth(well.totalDepthMd)}</span>
                    </span>
                  </span>
                  <span className="row row--tight">
                    <span className="mono t-xs t-mute">{well.distanceKm.toFixed(1)} km</span>
                    <StatusChip status={well.status} sm />
                  </span>
                </div>
              ))}
              {(twin.data?.nearbyWells ?? []).length === 0 && (
                <span className="t-sm t-mute">No offset wells inside the twin radius.</span>
              )}
            </div>
          </GlassCard>

          <GlassCard>
            <SectionHead
              icon="risk"
              title={t('twin.riskZones')}
              hint="Depth bands driving the red and orange slabs"
            />
            <div className="stack-list" style={{ marginTop: 12, maxHeight: 300, overflowY: 'auto' }}>
              {(twin.data?.riskBands ?? [])
                .filter((band) => band.band === 'CRITICAL' || band.band === 'HIGH')
                .slice(0, 12)
                .map((band) => {
                  const worst = Object.entries(band.hazards).sort((a, b) => b[1] - a[1])[0];
                  return (
                    <div key={band.depth} className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="row row--tight">
                        <span className="mono t-xs t-dim nowrap">
                          {band.depth.toFixed(0)}–{(band.depth + 100).toFixed(0)} m
                        </span>
                        <BandChip band={band.band} sm />
                      </span>
                      <span className="t-xs t-mute nowrap">
                        {worst ? `${HAZARD_SHORT[worst[0] as Hazard]} ${worst[1].toFixed(0)}%` : '—'}
                      </span>
                    </div>
                  );
                })}
              {(twin.data?.riskBands ?? []).every((band) => band.band !== 'CRITICAL' && band.band !== 'HIGH') && (
                <span className="t-sm" style={{ color: '#22c55e' }}>No high or critical depth bands in this section.</span>
              )}
            </div>
          </GlassCard>

          <GlassCard>
            <SectionHead icon="gauge" title={t('twin.reservoir')} />
            <div className="grid grid--2" style={{ marginTop: 12, gap: 10 }}>
              {[
                ['Reservoir', twin.data?.reservoir.name ?? '—'],
                ['Porosity', twin.data ? `${(twin.data.reservoir.porosity * 100).toFixed(1)}%` : '—'],
                ['Permeability', twin.data ? `${num(twin.data.reservoir.permMd)} mD` : '—'],
                ['Offset risk', twin.data ? `${twin.data.activeWell.riskScore.toFixed(0)} (${twin.data.activeWell.riskBand})` : '—'],
              ].map(([label, value]) => (
                <div key={label} className="glass" style={{ padding: '9px 11px' }}>
                  <div className="t-label" style={{ fontSize: 9.5 }}>{label}</div>
                  <div
                    className="mono t-sm"
                    style={{ color: label === 'Offset risk' && twin.data ? scoreColor(twin.data.activeWell.riskScore) : undefined }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>
            {focusWell && (
              <div className="banner banner--info" style={{ marginTop: 12 }}>
                <Icon name="info" size={14} />
                <span>
                  Twin centred on <strong>{focusWell.name}</strong>. Change the focus well from the navbar picker to
                  rebuild the twin around another well.
                </span>
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
