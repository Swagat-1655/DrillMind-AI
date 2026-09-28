import type {
  AlertsPayload,
  AnalyticsPayload,
  CopilotChunk,
  CopilotConfig,
  DatasetCatalogue,
  FormationRecord,
  GraphPayload,
  Hazard,
  HealthInfo,
  IncidentDetail,
  IncidentRow,
  KpisPayload,
  MemoryPayload,
  NetworkPayload,
  PlatformInfo,
  PredictionWindow,
  ReportPayload,
  RiskSummary,
  SimilarityPayload,
  TelemetrySnapshot,
  TwinPayload,
  WellDetail,
  WellRiskPayload,
  WellSummary,
  WhatIfPayload,
} from './types';

const BASE = '/api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function buildUrl(path: string, params?: Record<string, unknown>): string {
  const url = new URL(`${BASE}${path}`, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function getJson<T>(path: string, params?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(buildUrl(path, params), { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = typeof body?.detail === 'string' ? body.detail : JSON.stringify(body?.detail ?? body);
    } catch {
      /* keep the status text */
    }
    throw new ApiError(detail || `Request failed (${response.status})`, response.status);
  }
  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(buildUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal,
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const parsed = await response.json();
      detail = typeof parsed?.detail === 'string' ? parsed.detail : JSON.stringify(parsed?.detail ?? parsed);
    } catch {
      /* keep the status text */
    }
    throw new ApiError(detail || `Request failed (${response.status})`, response.status);
  }
  return (await response.json()) as T;
}

export const api = {
  health: (signal?: AbortSignal) => getJson<HealthInfo>('/health', undefined, signal),
  platform: (signal?: AbortSignal) => getJson<PlatformInfo>('/platform', undefined, signal),
  datasets: (signal?: AbortSignal) => getJson<DatasetCatalogue>('/datasets', undefined, signal),

  kpis: (wellId?: string, signal?: AbortSignal) => getJson<KpisPayload>('/kpis', { wellId }, signal),

  wells: (params?: Record<string, unknown>, signal?: AbortSignal) =>
    getJson<{
      count: number;
      total: number;
      wells: WellSummary[];
      facets: { status: string[]; formation: string[]; field: string[]; basin: string[]; operator: string[] };
    }>('/wells', params, signal),

  well: (id: string, signal?: AbortSignal) => getJson<WellDetail>(`/wells/${encodeURIComponent(id)}`, undefined, signal),
  wellRisk: (id: string, depth?: number, signal?: AbortSignal) =>
    getJson<WellRiskPayload>(`/wells/${encodeURIComponent(id)}/risk`, { depth }, signal),
  riskProfile: (id: string, step?: number, signal?: AbortSignal) =>
    getJson<import('./types').DepthProfile>(`/wells/${encodeURIComponent(id)}/risk/profile`, { step }, signal),
  similar: (id: string, limit?: number, signal?: AbortSignal) =>
    getJson<SimilarityPayload>(`/wells/${encodeURIComponent(id)}/similar`, { limit }, signal),
  network: (id: string, limit?: number, signal?: AbortSignal) =>
    getJson<NetworkPayload>(`/wells/${encodeURIComponent(id)}/network`, { limit }, signal),
  telemetry: (id: string, samples?: number, interval?: number, signal?: AbortSignal) =>
    getJson<TelemetrySnapshot>(`/wells/${encodeURIComponent(id)}/telemetry`, { samples, interval }, signal),
  twin: (id: string, radius?: number, signal?: AbortSignal) =>
    getJson<TwinPayload>(`/wells/${encodeURIComponent(id)}/twin`, { radius }, signal),
  memory: (id: string, signal?: AbortSignal) => getJson<MemoryPayload>(`/wells/${encodeURIComponent(id)}/memory`, undefined, signal),
  report: (id: string, params?: { narrative?: boolean; format?: string }, signal?: AbortSignal) =>
    getJson<ReportPayload>(`/wells/${encodeURIComponent(id)}/report`, params, signal),

  whatif: (id: string, overrides: Record<string, number>, signal?: AbortSignal) =>
    postJson<WhatIfPayload>(`/wells/${encodeURIComponent(id)}/whatif`, overrides, signal),
  whatifBaseline: (id: string, signal?: AbortSignal) =>
    getJson<{
      wellId: string;
      wellName: string;
      depth: number;
      formation: string;
      baseline: Record<string, number>;
      ranges: WhatIfPayload['ranges'];
    }>(`/wells/${encodeURIComponent(id)}/whatif/baseline`, undefined, signal),

  formations: (params?: { q?: string; basin?: string }, signal?: AbortSignal) =>
    getJson<{ count: number; formations: FormationRecord[]; taxonomy: { basin: string; formations: unknown[] }[] }>(
      '/formations',
      params,
      signal,
    ),
  formation: (name: string, signal?: AbortSignal) =>
    getJson<FormationRecord>(`/formations/${encodeURIComponent(name)}`, undefined, signal),

  incidents: (params?: Record<string, unknown>, signal?: AbortSignal) =>
    getJson<{ count: number; incidents: IncidentRow[] }>('/incidents', params, signal),
  incident: (id: string, signal?: AbortSignal) => getJson<IncidentDetail>(`/incidents/${encodeURIComponent(id)}`, undefined, signal),

  alerts: (params?: { severity?: string; hazard?: string; limit?: number }, signal?: AbortSignal) =>
    getJson<AlertsPayload>('/alerts', params, signal),
  analytics: (signal?: AbortSignal) => getJson<AnalyticsPayload>('/analytics', undefined, signal),
  knowledgeGraph: (wellId?: string, limit?: number, signal?: AbortSignal) =>
    getJson<GraphPayload>('/knowledge-graph', { wellId, limit }, signal),
  model: (signal?: AbortSignal) =>
    getJson<{
      name: string;
      version: string;
      structural: string;
      trainingCorpus: string;
      hazards: { hazard: Hazard; label: string; rationale: string }[];
      featureImportance: { feature: string; label: string; importance: number; importancePct: number }[];
      calibration: string;
      serving: string;
      playbooks: Record<string, string[]>;
      hazardWeights: Record<string, number>;
      parameters: WhatIfPayload['ranges'];
      alertThreshold: number;
    }>('/model', undefined, signal),

  copilotConfig: (signal?: AbortSignal) => getJson<CopilotConfig>('/copilot/config', undefined, signal),
  search: (q: string, k?: number, signal?: AbortSignal) =>
    getJson<{ query: string; count: number; results: { docId: string; kind: string; title: string; text: string; score: number }[] }>(
      '/search',
      { q, k },
      signal,
    ),

  reportDocxUrl: (id: string) => buildUrl(`/wells/${encodeURIComponent(id)}/report`, { format: 'docx' }),
  reportHtmlUrl: (id: string) => buildUrl(`/wells/${encodeURIComponent(id)}/report`, { format: 'html' }),
};

export interface CopilotStreamHandlers {
  onMeta?: (meta: Extract<CopilotChunk, { type: 'meta' }>) => void;
  onDelta?: (text: string) => void;
  onNotice?: (message: string) => void;
  onError?: (message: string) => void;
  onDone?: (provider: string) => void;
}

export interface CopilotHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Streams the copilot answer over Server-Sent Events. Uses fetch rather than
 * EventSource so the request can carry a JSON body.
 */
export async function streamCopilot(
  payload: { message: string; wellId?: string; language?: string; history?: CopilotHistoryTurn[] },
  handlers: CopilotStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(buildUrl('/copilot/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok || !response.body) {
    let detail = `Copilot request failed (${response.status})`;
    try {
      const parsed = await response.json();
      if (typeof parsed?.detail === 'string') detail = parsed.detail;
    } catch {
      /* keep the default */
    }
    handlers.onError?.(detail);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.startsWith('data:')) {
          const raw = line.slice(5).trim();
          if (raw) {
            try {
              const chunk = JSON.parse(raw) as CopilotChunk;
              switch (chunk.type) {
                case 'meta':
                  handlers.onMeta?.(chunk);
                  break;
                case 'delta':
                  handlers.onDelta?.(chunk.text);
                  break;
                case 'notice':
                  handlers.onNotice?.(chunk.message);
                  break;
                case 'error':
                  handlers.onError?.(chunk.message);
                  break;
                case 'done':
                  handlers.onDone?.(chunk.provider);
                  break;
              }
            } catch {
              /* ignore malformed frame */
            }
          }
        }
        newline = buffer.indexOf('\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export type { PredictionWindow, ReportPayload, RiskSummary };
