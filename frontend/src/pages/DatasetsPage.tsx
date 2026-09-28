import { useState } from 'react';
import {
  AsyncBoundary,
  Chip,
  GlassCard,
  Icon,
  SectionHead,
  SearchInput,
  Skeleton,
} from '../components/ui';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { compact, cx, num } from '../lib/format';
import { useAsync, useDebounced } from '../lib/hooks';
import { useApp } from '../store';

const STATUS_TONE: Record<string, string> = {
  ingested: 'chip chip--green',
  streaming: 'chip chip--cyan',
  live: 'chip chip--cyan',
  indexed: 'chip chip--violet',
  pending: 'chip chip--moderate',
};

export default function DatasetsPage() {
  const { t } = useI18n();
  const { focusWell } = useApp();
  const [query, setQuery] = useState('mud loss LCM treatment Kopili');
  const debounced = useDebounced(query, 320);
  const [k, setK] = useState(8);

  const datasets = useAsync((signal) => api.datasets(signal), []);
  const health = useAsync((signal) => api.health(signal), []);
  const search = useAsync(
    (signal) => (debounced.trim().length > 2 ? api.search(debounced, k, signal) : Promise.resolve(null)),
    [debounced, k],
  );

  return (
    <div className="stack-list" style={{ gap: 18 }}>
      {/* -------------------------------------------------------- catalogue */}
      <GlassCard glow>
        <SectionHead
          icon="database"
          title={t('datasets.title')}
          hint={t('datasets.subtitle')}
          actions={
            health.data && (
              <>
                <Chip className="chip chip--cyan">
                  <Icon name="cpu" size={11} /> {health.data.retrieval.index}
                </Chip>
                <Chip className="chip chip--green">
                  {num(health.data.retrieval.documents)} documents
                </Chip>
                <Chip className="chip chip--violet">
                  {num(health.data.retrieval.vocabulary)} terms
                </Chip>
              </>
            )
          }
        />

        <div className="grid grid--3" style={{ marginTop: 14 }}>
          {(datasets.data?.sources ?? []).map((source) => (
            <article key={source.id} className="feature-card" style={{ ['--tone' as string]: '#22d3ee' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="feature-card__icon" style={{ width: 32, height: 32 }}>
                  <Icon
                    name={
                      source.id === 'ertmac'
                        ? 'activity'
                        : source.id === 'survey'
                          ? 'compass'
                          : source.id === 'mudlog'
                            ? 'wave'
                            : source.id === 'cement'
                              ? 'shield'
                              : source.id === 'lessons'
                                ? 'book'
                                : 'file'
                    }
                    size={15}
                  />
                </span>
                <span className={STATUS_TONE[source.status] ?? 'chip chip--neutral'}>{source.status}</span>
              </div>
              <h3 style={{ fontSize: 14 }}>{source.name}</h3>
              <div className="t-xs t-mute">{source.format}</div>
              <div className="row" style={{ justifyContent: 'space-between', marginTop: 'auto' }}>
                <span className="mono t-sm" style={{ color: '#22d3ee' }}>{compact(source.records)}</span>
                <span className="t-xs t-mute">records</span>
              </div>
            </article>
          ))}
          {datasets.loading &&
            Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} height={134} />)}
        </div>

        <div className="divider" style={{ margin: '16px 0' }} />
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <span className="t-label">Features supported</span>
          {['Search', 'Filter', 'Sort', 'Export', 'Hindi translation'].map((feature) => (
            <Chip key={feature} className="chip chip--neutral" >
              <Icon name="check" size={11} /> {feature}
            </Chip>
          ))}
        </div>
      </GlassCard>

      {/* -------------------------------------------------------- retrieval */}
      <section>
        <SectionHead
          icon="search"
          title="Retrieval index search"
          hint="The exact BM25 index the AI copilot retrieves from — search it directly to see what the model can see"
          actions={
            <>
              <SearchInput value={query} onChange={setQuery} placeholder="Search reports, incidents, lessons…" width={300} />
              <div className="segmented">
                {[4, 8, 16].map((count) => (
                  <button key={count} type="button" aria-pressed={k === count} onClick={() => setK(count)}>
                    {count}
                  </button>
                ))}
              </div>
            </>
          }
        />

        <div className="grid grid--split-wide" style={{ marginTop: 12, alignItems: 'start' }}>
          <div className="stack-list">
            <AsyncBoundary loading={search.loading} error={search.error} onRetry={search.reload} skeletonRows={5}>
              {search.data?.results.map((result, index) => (
                <GlassCard key={result.docId}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="row row--tight">
                      <span className="citation" style={{ marginLeft: 0 }}>{index + 1}</span>
                      <span className="chip chip--neutral chip--sm" style={{ textTransform: 'none', letterSpacing: 0 }}>
                        {result.kind}
                      </span>
                      <span style={{ fontWeight: 620, fontSize: 13 }}>{result.title}</span>
                    </span>
                    <span className="mono t-xs t-mute">score {result.score.toFixed(3)}</span>
                  </div>
                  <p className="t-sm t-dim" style={{ marginTop: 9, lineHeight: 1.72 }}>{result.text}</p>
                </GlassCard>
              ))}
              {search.data && search.data.results.length === 0 && (
                <div className="banner banner--warn">
                  <Icon name="info" size={15} />
                  No document matched those terms. Try a formation name, a hazard, or a mitigation technique.
                </div>
              )}
              {!search.data && !search.loading && (
                <div className="empty">
                  <Icon name="search" size={22} />
                  Type at least three characters to query the index.
                </div>
              )}
            </AsyncBoundary>
          </div>

          <div className="stack-list">
            <GlassCard>
              <SectionHead icon="cpu" title="Retrieval engine" />
              <div className="stack-list" style={{ marginTop: 12, gap: 9 }}>
                {health.data && (
                  <>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="t-xs t-mute">Index</span>
                      <span className="mono t-xs t-dim">{health.data.retrieval.index}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="t-xs t-mute">Documents</span>
                      <span className="mono t-xs t-dim">{num(health.data.retrieval.documents)}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="t-xs t-mute">Vocabulary</span>
                      <span className="mono t-xs t-dim">{num(health.data.retrieval.vocabulary)}</span>
                    </div>
                    <div className="divider" />
                    {Object.entries(health.data.retrieval.byKind).map(([kind, count]) => (
                      <div key={kind} className="row" style={{ justifyContent: 'space-between' }}>
                        <span className="t-xs t-mute">{kind}</span>
                        <span className="mono t-xs t-dim">{num(count)}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </GlassCard>

            <GlassCard>
              <SectionHead icon="sparkles" title="Copilot wiring" />
              <div className="stack-list" style={{ marginTop: 12, gap: 9 }}>
                {health.data && (
                  <>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="t-xs t-mute">LLM provider</span>
                      <span className={cx('chip', health.data.llm.status === 'groq' ? 'chip--green' : 'chip--moderate')}>
                        {health.data.llm.status === 'groq' ? 'Groq' : 'local engine'}
                      </span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="t-xs t-mute">Model</span>
                      <span className="mono t-xs t-dim">{health.data.llm.model ?? 'drillmind-analytical'}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="t-xs t-mute">Offline fallback</span>
                      <span className="mono t-xs t-dim">{health.data.llm.offlineFallback ? 'enabled' : 'disabled'}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="t-xs t-mute">Corpus seed</span>
                      <span className="mono t-xs t-dim">{health.data.dataset.seed}</span>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="t-xs t-mute">Wells / events</span>
                      <span className="mono t-xs t-dim">
                        {num(health.data.dataset.wells)} / {num(health.data.dataset.events)}
                      </span>
                    </div>
                  </>
                )}
              </div>
              <div className="divider" style={{ margin: '13px 0' }} />
              <div className="t-xs t-mute" style={{ lineHeight: 1.7 }}>
                The copilot assembles a live context block (well state, hazard ensemble, depth bands, analogues) plus the
                top document extracts, then streams the answer over SSE. Retrieved extracts are cited inline as{' '}
                <span className="citation" style={{ marginLeft: 0 }}>1</span> and clickable.
              </div>
            </GlassCard>

            <GlassCard>
              <SectionHead icon="shield" title="Data governance" />
              <ul className="bullets" style={{ marginTop: 10 }}>
                <li>The Groq key lives only in <code>backend/.env</code> (gitignored) and is never sent to the browser.</li>
                <li>Every numeric in this platform is computed from the corpus — no numbers are hard-coded in the UI.</li>
                <li>The corpus is seeded, so a demo replays identically on any machine.</li>
              </ul>
              {focusWell && (
                <div className="banner banner--info" style={{ marginTop: 12 }}>
                  <Icon name="pin" size={14} />
                  <span>
                    Current focus well <strong>{focusWell.name}</strong> ({focusWell.id}) — retrieval is boosted 1.25× for
                    documents from this well.
                  </span>
                </div>
              )}
            </GlassCard>
          </div>
        </div>
      </section>
    </div>
  );
}
