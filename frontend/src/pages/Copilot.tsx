import { useEffect, useMemo, useRef, useState } from 'react';
import { Gauge } from '../components/charts';
import {
  AsyncBoundary,
  BandChip,
  Chip,
  GlassCard,
  Icon,
  SectionHead,
  Skeleton,
} from '../components/ui';
import { useI18n } from '../i18n';
import { api, streamCopilot, type CopilotHistoryTurn } from '../lib/api';
import { HAZARD_COLOR, HAZARD_SHORT, depth as fmtDepth, num, pct } from '../lib/format';
import { useAsync } from '../lib/hooks';
import type { CopilotMeta, CopilotSource } from '../lib/types';
import { useApp } from '../store';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  meta?: CopilotMeta;
  sources?: CopilotSource[];
  provider?: string;
  notice?: string;
  streaming?: boolean;
}

let messageSeq = 0;

export default function Copilot() {
  const { t, isHindi, lang } = useI18n();
  const { focusWellId, focusWell } = useApp();

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeSource, setActiveSource] = useState<CopilotSource | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const config = useAsync((signal) => api.copilotConfig(signal), []);
  const risk = useAsync(
    (signal) => (focusWellId ? api.wellRisk(focusWellId, undefined, signal) : Promise.resolve(null)),
    [focusWellId],
  );

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const history: CopilotHistoryTurn[] = useMemo(
    () => messages.slice(-6).map((message) => ({ role: message.role, content: message.content })),
    [messages],
  );

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;

    const userMessage: Message = { id: (messageSeq += 1), role: 'user', content: question };
    const assistantId = (messageSeq += 1);
    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantId, role: 'assistant', content: '', streaming: true },
    ]);
    setDraft('');
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    let accumulated = '';
    try {
      await streamCopilot(
        {
          message: question,
          wellId: focusWellId ?? undefined,
          language: lang,
          history,
        },
        {
          onMeta: (meta) =>
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId ? { ...message, meta, sources: meta.sources } : message,
              ),
            ),
          onDelta: (chunk) => {
            accumulated += chunk;
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId ? { ...message, content: accumulated } : message,
              ),
            );
          },
          onNotice: (notice) =>
            setMessages((prev) => prev.map((message) => (message.id === assistantId ? { ...message, notice } : message))),
          onError: (error) =>
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId
                  ? { ...message, content: `${message.content}\n\n**Copilot error:** ${error}`, streaming: false }
                  : message,
              ),
            ),
          onDone: (provider) =>
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId ? { ...message, provider, streaming: false } : message,
              ),
            ),
        },
        controller.signal,
      );
    } catch (error) {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                streaming: false,
                content:
                  message.content ||
                  `**Request failed.** ${error instanceof Error ? error.message : String(error)}`,
              }
            : message,
        ),
      );
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const latestMeta = [...messages].reverse().find((message) => message.meta)?.meta;

  return (
    <div className="copilot-shell">
      {/* ------------------------------------------------------------- chat */}
      <GlassCard pad={false} style={{ display: 'flex', flexDirection: 'column', minHeight: 540 }}>
        <div style={{ padding: '15px 18px', borderBottom: '1px solid var(--border)' }}>
          <SectionHead
            icon="copilot"
            title={t('copilot.title')}
            hint={t('copilot.subtitle')}
            actions={
              <>
                <Chip className={config.data?.status === 'groq' ? 'chip chip--green' : 'chip chip--moderate'}>
                  <Icon name="cpu" size={11} />
                  {config.data ? (config.data.status === 'groq' ? config.data.model : t('copilot.offline')) : '…'}
                </Chip>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => setMessages([])}
                  disabled={messages.length === 0}
                >
                  <Icon name="plus" size={12} /> {t('copilot.clear')}
                </button>
              </>
            }
          />
        </div>

        <div className="chat-scroll" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="empty" style={{ padding: '36px 12px' }}>
              <Icon name="copilot" size={26} style={{ color: 'var(--cyan)' }} />
              <div style={{ fontWeight: 620, color: 'var(--text-dim)' }}>{t('copilot.empty')}</div>
              <div className="t-xs">
                {config.data
                  ? `${num(config.data.retrieval.documents)} documents indexed · ${num(config.data.retrieval.vocabulary)} terms`
                  : t('common.loading')}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className={`chat-msg chat-msg--${message.role}`}>
              <span className={`chat-avatar chat-avatar--${message.role === 'user' ? 'user' : 'bot'}`}>
                {message.role === 'user' ? 'DE' : <Icon name="sparkles" size={15} />}
              </span>
              <div className="chat-bubble">
                {message.notice && (
                  <div className="banner banner--warn" style={{ marginBottom: 10, padding: '7px 10px', fontSize: 11.5 }}>
                    <Icon name="info" size={13} /> {message.notice}
                  </div>
                )}
                {message.content ? (
                  <Markdown
                    text={message.content}
                    sources={message.sources}
                    onCite={(index) => {
                      const source = message.sources?.find((item) => item.index === index);
                      if (source) setActiveSource(source);
                    }}
                  />
                ) : message.streaming ? (
                  <span className="row row--tight t-mute t-sm">
                    <span className="spinner" /> {t('copilot.thinking')}…
                  </span>
                ) : null}
                {message.streaming && message.content && <span className="typing-cursor" />}
                {message.provider && !message.streaming && (
                  <div className="row row--tight t-xs t-mute" style={{ marginTop: 9, gap: 8 }}>
                    <Icon name="check" size={11} style={{ color: '#22c55e' }} />
                    {message.provider === 'groq' ? `Groq · ${message.meta?.model ?? ''}` : t('copilot.offline')}
                    {message.sources && message.sources.length > 0 && (
                      <span>· {message.sources.length} sources cited</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="chat-composer">
          <textarea
            className="textarea"
            value={draft}
            placeholder={t('copilot.placeholder')}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
            rows={2}
          />
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void send(draft)}
            disabled={busy || draft.trim().length === 0}
            style={{ height: 46 }}
          >
            {busy ? <span className="spinner" /> : <Icon name="arrowRight" size={15} />}
            {t('copilot.send')}
          </button>
        </div>
      </GlassCard>

      {/* ------------------------------------------------------------ sidebar */}
      <div className="stack-list">
        <GlassCard>
          <SectionHead icon="sparkles" title={t('copilot.suggestions')} />
          <div className="stack-list" style={{ marginTop: 12, gap: 7 }}>
            {(config.data?.suggestions ?? []).map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                className="suggestion-pill"
                onClick={() => void send(isHindi ? suggestion.textHi : suggestion.text)}
                disabled={busy}
              >
                <Icon name={suggestionIcon(suggestion.icon)} size={12} style={{ marginRight: 7, verticalAlign: -1 }} />
                {isHindi ? suggestion.textHi : suggestion.text}
              </button>
            ))}
            {!config.data &&
              Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} height={34} />)}
          </div>
        </GlassCard>

        <GlassCard>
          <SectionHead
            icon="target"
            title={t('copilot.context')}
            hint={focusWell ? focusWell.name : undefined}
            actions={focusWell && <BandChip band={focusWell.riskBand} />}
          />
          <AsyncBoundary loading={risk.loading} error={risk.error} onRetry={risk.reload} skeletonRows={3}>
            {risk.data && (
              <div className="stack-list" style={{ marginTop: 12 }}>
                <div className="grid grid--2" style={{ gap: 8 }}>
                  {[
                    ['Depth', fmtDepth(risk.data.summary.depth)],
                    ['Formation', focusWell?.formation ?? '—'],
                    ['Composite', pct(risk.data.summary.composite)],
                    ['Band', risk.data.summary.band],
                  ].map(([label, value]) => (
                    <div key={label} className="glass" style={{ padding: '8px 10px' }}>
                      <div className="t-label" style={{ fontSize: 9.4 }}>{label}</div>
                      <div className="mono t-sm">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="divider" />
                <div className="grid grid--3" style={{ gap: 6 }}>
                  {risk.data.predictions.slice(0, 3).map((prediction) => (
                    <Gauge
                      key={prediction.hazard}
                      value={prediction.probabilityPct}
                      confidence={prediction.confidencePct}
                      color={HAZARD_COLOR[prediction.hazard]}
                      size={104}
                      caption={HAZARD_SHORT[prediction.hazard]}
                    />
                  ))}
                </div>
                <div className="divider" />
                <span className="t-label">Playbook in force</span>
                <ul className="bullets" style={{ marginTop: 8 }}>
                  {risk.data.summary.actions.slice(0, 3).map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </div>
            )}
          </AsyncBoundary>
        </GlassCard>

        <GlassCard>
          <SectionHead
            icon="book"
            title={t('copilot.sources')}
            hint={latestMeta ? `${latestMeta.sources.length} retrieved documents` : 'Retrieved from the corpus'}
          />
          <div className="stack-list" style={{ marginTop: 12, maxHeight: 320, overflowY: 'auto' }}>
            {(latestMeta?.sources ?? []).map((source) => (
              <button
                key={source.docId}
                type="button"
                onClick={() => setActiveSource(source)}
                className="glass"
                style={{ padding: '9px 11px', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)' }}
              >
                <div className="row row--tight">
                  <span className="citation">{source.index}</span>
                  <span className="t-xs" style={{ color: 'var(--cyan)' }}>{source.kind}</span>
                </div>
                <div className="t-xs t-dim clamp-2" style={{ marginTop: 5 }}>{source.title}</div>
              </button>
            ))}
            {!latestMeta && <span className="t-xs t-mute">Sources appear here once you ask a question.</span>}
          </div>
        </GlassCard>

        {config.data && (
          <GlassCard>
            <SectionHead icon="shield" title="Capabilities" />
            <ul className="bullets" style={{ marginTop: 10 }}>
              {config.data.capabilities.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="divider" style={{ margin: '12px 0' }} />
            <div className="stack-list" style={{ gap: 5 }}>
              {Object.entries(config.data.retrieval.byKind).map(([kind, count]) => (
                <div key={kind} className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="t-xs t-mute">{kind}</span>
                  <span className="mono t-xs t-dim">{num(count)}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        )}
      </div>

      {/* --------------------------------------------------------- source view */}
      {activeSource && (
        <div className="no-print">
          <div className="modal-scrim" onMouseDown={(event) => event.target === event.currentTarget && setActiveSource(null)}>
            <div className="modal">
              <div className="modal__head">
                <span className="citation" style={{ marginLeft: 0 }}>{activeSource.index}</span>
                <div style={{ flex: 1 }}>
                  <h3 className="t-h3">{activeSource.title}</h3>
                  <div className="t-xs t-mute">
                    {activeSource.kind} · {activeSource.docId} · relevance {(activeSource.score * 100).toFixed(1)}
                  </div>
                </div>
                <button type="button" className="btn btn--ghost btn--icon" onClick={() => setActiveSource(null)}>
                  <Icon name="close" size={15} />
                </button>
              </div>
              <div className="modal__body">
                <p className="t-sm t-dim" style={{ lineHeight: 1.75 }}>
                  {latestMeta?.evidence.find((item) => item.docId === activeSource.docId)?.text ??
                    'Full text is available in the retrieval index (open the Data Sources page to search it directly).'}
                </p>
                {Object.keys(activeSource.metadata ?? {}).length > 0 && (
                  <div className="glass glass--pad">
                    <span className="t-label">Document metadata</span>
                    <div className="grid grid--2" style={{ marginTop: 10, gap: 8 }}>
                      {Object.entries(activeSource.metadata).map(([key, value]) => (
                        <div key={key}>
                          <div className="t-label" style={{ fontSize: 9.4 }}>{key}</div>
                          <div className="mono t-sm">{String(value)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function suggestionIcon(icon: string) {
  const map: Record<string, 'droplet' | 'layers' | 'activity' | 'shield' | 'network' | 'anchor' | 'chart'> = {
    droplet: 'droplet',
    layers: 'layers',
    activity: 'activity',
    shield: 'shield',
    network: 'network',
    anchor: 'anchor',
    chart: 'chart',
  };
  return map[icon] ?? 'sparkles';
}

/** Minimal markdown renderer: bold, bullets, headings and [n] citations. */
function Markdown({
  text,
  sources,
  onCite,
}: {
  text: string;
  sources?: CopilotSource[];
  onCite: (index: number) => void;
}) {
  const blocks = useMemo(() => text.split(/\n{2,}/), [text]);

  return (
    <div>
      {blocks.map((block, blockIndex) => {
        const lines = block.split('\n').filter((line) => line.trim().length > 0);
        const isList = lines.length > 0 && lines.every((line) => /^[-*•]\s+/.test(line.trim()));
        if (isList) {
          return (
            <ul key={blockIndex}>
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{renderInline(line.replace(/^[-*•]\s+/, ''), sources, onCite)}</li>
              ))}
            </ul>
          );
        }
        const heading = /^\*\*(.+)\*\*$/.exec(lines[0]?.trim() ?? '');
        if (heading && lines.length === 1) {
          return (
            <p key={blockIndex} style={{ fontWeight: 680, marginTop: blockIndex === 0 ? 0 : 6 }}>
              {heading[1]}
            </p>
          );
        }
        return (
          <p key={blockIndex} style={{ marginTop: blockIndex === 0 ? 0 : 9 }}>
            {lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex > 0 && <br />}
                {renderInline(line, sources, onCite)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(text: string, sources: CopilotSource[] | undefined, onCite: (index: number) => void) {
  const parts: (string | { bold: string } | { cite: number })[] = [];
  const pattern = /(\*\*[^*]+\*\*)|(\[[0-9]+\])/g;
  let lastIndex = 0;
  let match = pattern.exec(text);
  while (match !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[1]) parts.push({ bold: match[1].slice(2, -2) });
    else if (match[2]) parts.push({ cite: Number(match[2].slice(1, -1)) });
    lastIndex = match.index + match[0].length;
    match = pattern.exec(text);
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));

  return (
    <>
      {parts.map((part, index) => {
        if (typeof part === 'string') return <span key={index}>{part}</span>;
        if ('bold' in part) return <strong key={index}>{part.bold}</strong>;
        const exists = sources?.some((source) => source.index === part.cite);
        return (
          <span
            key={index}
            className="citation"
            onClick={() => exists && onCite(part.cite)}
            style={exists ? undefined : { opacity: 0.45 }}
            title={exists ? 'Open source document' : 'Unmatched citation'}
          >
            {part.cite}
          </span>
        );
      })}
    </>
  );
}
