import { useNavigate } from 'react-router-dom';
import { HeroScene } from '../components/scenes';
import { GlassCard, Icon, SectionHead, Spinner, type IconName } from '../components/ui';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { compact, num, pct } from '../lib/format';
import { useAsync } from '../lib/hooks';
import { useApp } from '../store';

const FEATURES: { icon: IconName; tone: string; titleKey: string; title: string; body: string }[] = [
  {
    icon: 'map',
    tone: '#38bdf8',
    titleKey: 'nav.map',
    title: 'Nearby Wells Intelligence Map',
    body: 'A full-screen GIS view of every offset well — active, historical, risk and critical — with geological, formation, reservoir and risk layers.',
  },
  {
    icon: 'history',
    tone: '#a78bfa',
    titleKey: 'nav.formation',
    title: 'Formation Time Machine',
    body: 'Every event ever recorded in a formation, banded by depth, with the mitigation that actually worked and an AI summary of the interval to watch.',
  },
  {
    icon: 'similarity',
    tone: '#22d3ee',
    titleKey: 'nav.similarity',
    title: 'AI Well Similarity Engine',
    body: 'Five explicit evidence groups — formation, depth, pressure, parameters and events — blended into a similarity score you can interrogate.',
  },
  {
    icon: 'risk',
    tone: '#ef4444',
    titleKey: 'nav.risk',
    title: 'Explainable Risk Engine',
    body: 'Six hazards forecast at the bit with probability, confidence and exact additive feature attributions, backed by real offset-well incidents.',
  },
  {
    icon: 'twin',
    tone: '#f59e0b',
    titleKey: 'nav.twin',
    title: 'Digital Twin & Incident Replay',
    body: 'A 3D operational twin of the active well and its offsets, plus parameter-by-parameter replay of the incidents that shaped the field.',
  },
  {
    icon: 'copilot',
    tone: '#22c55e',
    titleKey: 'nav.copilot',
    title: 'AI Drilling Copilot',
    body: 'Ask a question in English or Hindi; answers are retrieved from completion reports, daily drilling reports and lessons learned, with citations.',
  },
];

const STACK = [
  'FastAPI',
  'React',
  'PostgreSQL',
  'PostGIS',
  'ChromaDB',
  'GPT-OSS 120B',
  'Groq',
  'XGBoost',
  'ArcGIS',
  'Mapbox',
  'GeoServer',
  'Three.js',
  'Leaflet',
  'BM25 Retrieval',
];

export default function Landing() {
  const { t, isHindi } = useI18n();
  const navigate = useNavigate();
  const { wells } = useApp();
  const { data, loading, error } = useAsync((signal) => api.platform(signal), []);

  return (
    <div>
      {/* ---------------------------------------------------------------- hero */}
      <section className="hero">
        <div className="hero__copy">
          <span className="hero__eyebrow">
            <span className="dot dot--pulse" style={{ background: '#22c55e', color: '#22c55e' }} />
            {t('landing.eyebrow')}
          </span>
          <h1 className="t-h1">
            <span className="gradient-text">{isHindi ? 'ड्रिलमाइंड एआई' : 'DrillMind AI'}</span>
          </h1>
          <p className="t-label" style={{ letterSpacing: '.16em' }}>
            Nearby Wells Intelligence System · NWIS
          </p>
          <p className="hero__sub">{t('landing.subtitle')}</p>

          <div className="hero__actions">
            <button type="button" className="btn btn--primary btn--lg" onClick={() => navigate('/dashboard')}>
              <Icon name="dashboard" size={16} /> {t('landing.cta2')}
            </button>
            <button type="button" className="btn btn--lg" onClick={() => navigate('/map')}>
              <Icon name="map" size={16} /> {t('landing.cta3')}
            </button>
            <button type="button" className="btn btn--ghost btn--lg" onClick={() => navigate('/copilot')}>
              <Icon name="copilot" size={16} /> {t('landing.cta1')}
            </button>
          </div>

          <div className="row" style={{ gap: 18, marginTop: 6 }}>
            <div>
              <div className="t-label">Wells on record</div>
              <div className="mono" style={{ fontSize: 21, color: '#22d3ee' }}>
                {data ? num(data.totals.totalWells) : '—'}
              </div>
            </div>
            <div>
              <div className="t-label">Events analysed</div>
              <div className="mono" style={{ fontSize: 21, color: '#f97316' }}>
                {data ? num(data.totals.eventsAnalyzed) : '—'}
              </div>
            </div>
            <div>
              <div className="t-label">Basins</div>
              <div className="mono" style={{ fontSize: 21, color: '#a78bfa' }}>
                {data ? num(data.totals.basins) : '—'}
              </div>
            </div>
            <div>
              <div className="t-label">NPT on record</div>
              <div className="mono" style={{ fontSize: 21, color: '#22c55e' }}>
                {data ? `${compact(data.totals.totalNptHours)} hr` : '—'}
              </div>
            </div>
          </div>
        </div>

        <div className="hero__stage">
          <HeroScene wells={wells} />
          <div className="hero__hud">
            <span className="hud-pill">
              <Icon name="wave" size={12} style={{ color: '#22d3ee' }} />
              telemetry streams <strong>{wells.filter((well) => well.status === 'ACTIVE').length || '—'}</strong>
            </span>
            <span className="hud-pill">
              <Icon name="layers" size={12} style={{ color: '#a78bfa' }} />
              formation heat zones <strong>5</strong>
            </span>
            <span className="hud-pill">
              <Icon name="alerts" size={12} style={{ color: '#ef4444' }} />
              risk pulses <strong>{wells.filter((well) => well.riskScore > 78).length || '—'}</strong>
            </span>
            <span className="hud-pill">
              <Icon name="target" size={12} style={{ color: '#f97316' }} />
              live wells <strong>{wells.filter((well) => well.status === 'ACTIVE').length || '—'}</strong>
            </span>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- stats */}
      <section className="landing-section">
        <SectionHead icon="analytics" title={t('landing.statsTitle')} hint={t('landing.statsSub')} />
        {loading && (
          <div className="row" style={{ gap: 12 }}>
            <Spinner /> <span className="t-dim">{t('common.loading')}…</span>
          </div>
        )}
        {error && <div className="banner banner--danger">{error}</div>}
        {data && (
          <div className="grid grid--3 stagger">
            {data.stats.map((stat) => (
              <article key={stat.key} className="stat-card" style={{ ['--tone' as string]: toneOf(stat.tone) }}>
                <span className="t-label">{isHindi ? stat.labelHi : stat.label}</span>
                <span className="stat-card__value">{num(stat.value)}</span>
                <span className="t-xs t-mute">{stat.detail}</span>
                <div className="progress" style={{ marginTop: 4 }}>
                  <div
                    className="progress__fill"
                    style={{
                      width: `${Math.min(100, (stat.value / Math.max(1, data.stats[0].value || 1)) * 100)}%`,
                      ['--tone' as string]: toneOf(stat.tone),
                    }}
                  />
                </div>
              </article>
            ))}
          </div>
        )}

        {data && (
          <div className="grid grid--split-wide">
            <GlassCard>
              <SectionHead icon="pin" title="Fields and operators on the platform" />
              <div className="grid grid--4" style={{ marginTop: 12, gap: 10 }}>
                {data.fields.map((field) => (
                  <div
                    key={field.name}
                    className="glass glass--pad"
                    style={{ padding: '10px 12px', background: 'color-mix(in srgb, var(--surface-solid) 55%, transparent)' }}
                  >
                    <div style={{ fontWeight: 620, fontSize: 13 }}>{field.name}</div>
                    <div className="t-xs t-mute">{field.operator}</div>
                    <div className="t-xs" style={{ color: '#22d3ee', marginTop: 3 }}>
                      {field.basin}
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard>
              <SectionHead icon="bolt" title="Tracked hazards" />
              <div className="stack-list" style={{ marginTop: 12 }}>
                {data.taxonomy.hazards.map((hazard) => (
                  <div key={hazard.key} className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="row" style={{ gap: 8 }}>
                      <span className="dot" style={{ background: '#f97316', color: '#f97316' }} />
                      <span className="t-sm">{isHindi ? hazard.labelHi : hazard.label}</span>
                    </span>
                    <span className="mono t-xs t-mute">forecast</span>
                  </div>
                ))}
              </div>
              <div className="divider" style={{ margin: '13px 0' }} />
              <div className="t-xs t-dim">
                Copilot engine:{' '}
                <span className="mono" style={{ color: data.llm.status === 'groq' ? '#22c55e' : '#f59e0b' }}>
                  {data.llm.status === 'groq' ? `Groq · ${data.llm.model}` : 'local analytical engine'}
                </span>
              </div>
            </GlassCard>
          </div>
        )}
      </section>

      {/* ----------------------------------------------------------- features */}
      <section className="landing-section">
        <SectionHead icon="sparkles" title={t('landing.featuresTitle')} hint={t('landing.featuresSub')} />
        <div className="grid grid--3 stagger">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="feature-card"
              style={{ ['--tone' as string]: feature.tone, cursor: 'pointer' }}
              onClick={() =>
                navigate(
                  feature.titleKey === 'nav.map'
                    ? '/map'
                    : feature.titleKey === 'nav.formation'
                      ? '/formation'
                      : feature.titleKey === 'nav.similarity'
                        ? '/similarity'
                        : feature.titleKey === 'nav.risk'
                          ? '/risk'
                          : feature.titleKey === 'nav.twin'
                            ? '/twin'
                            : '/copilot',
                )
              }
            >
              <span className="feature-card__icon">
                <Icon name={feature.icon} size={18} />
              </span>
              <h3 style={{ fontSize: 15 }}>{feature.title}</h3>
              <p className="t-sm t-dim">{feature.body}</p>
              <span className="row row--tight t-xs" style={{ color: feature.tone, marginTop: 'auto' }}>
                {t('common.open')} <Icon name="arrowRight" size={12} />
              </span>
            </article>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------------- stack */}
      <section className="landing-section">
        <SectionHead icon="cpu" title={t('landing.stackTitle')} hint="Target architecture for the deployed platform." />
        <div className="row" style={{ gap: 9 }}>
          {STACK.map((item) => (
            <span
              key={item}
              className="chip chip--neutral"
              style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12, padding: '6px 12px' }}
            >
              {item}
            </span>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------- footer */}
      <footer className="landing-section" style={{ borderTop: '1px solid var(--border)', marginTop: 10 }}>
        <div className="grid grid--3">
          <div className="stack-list">
            <div className="row" style={{ gap: 10 }}>
              <Icon name="formation" size={18} style={{ color: '#22d3ee' }} />
              <strong style={{ fontFamily: 'Poppins, sans-serif', fontSize: 16 }}>{t('app.name')}</strong>
            </div>
            <p className="t-sm t-dim">{t('landing.footerTagline')}</p>
          </div>
          <div className="stack-list">
            <span className="t-label">Programme</span>
            <span className="t-sm t-dim">{t('app.hackathon')}</span>
            <span className="t-sm t-dim">Problem statement: eRTMAC-NWIS</span>
          </div>
          <div className="stack-list">
            <span className="t-label">Corpus</span>
            <span className="t-sm t-dim">
              {data ? `${num(data.totals.totalWells)} wells · ${num(data.totals.eventsAnalyzed)} events` : '—'}
            </span>
            <span className="t-sm t-dim">
              {data ? `${num(data.totals.formationRecords)} formation intersections` : '—'}
            </span>
            <span className="t-xs t-mute">
              Synthetic but structurally faithful corpus · deterministic and reproducible
            </span>
          </div>
        </div>
        <div className="divider" style={{ marginTop: 8 }} />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="t-xs t-mute">
            © {new Date().getFullYear()} DrillMind AI · {t('app.hackathon')}
          </span>
          <span className="row row--tight t-xs t-mute">
            <span className="dot dot--pulse" style={{ background: '#22c55e', color: '#22c55e' }} />
            API {error ? 'offline' : 'online'}
            {data && <span className="mono">· {pct(data.totals.activeWells / Math.max(1, data.totals.totalWells) * 100)} drilling</span>}
          </span>
        </div>
      </footer>
    </div>
  );
}

function toneOf(tone: string): string {
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
