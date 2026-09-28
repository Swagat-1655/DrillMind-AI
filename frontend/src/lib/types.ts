/** Shared API types. Fields mirror the FastAPI payloads in `backend/app`. */

export type RiskBand = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type WellStatus = 'ACTIVE' | 'HISTORICAL' | 'RISK' | 'CRITICAL';
export type Outcome = 'SUCCESS' | 'PARTIAL' | 'FAILURE';
export type Hazard =
  | 'MUDFLOSS'
  | 'KICK'
  | 'OVERPRESSURE'
  | 'TORQUE_SPIKE'
  | 'STUCK_PIPE'
  | 'CEMENTING_FAILURE'
  | 'BIT_DAMAGE';

export type Lang = 'en' | 'hi';

export interface HazardMeta {
  key: Hazard;
  label: string;
  labelHi: string;
}

export interface StatCard {
  key: string;
  label: string;
  labelHi: string;
  value: number;
  tone: string;
  detail: string;
}

export interface PlatformInfo {
  stats: StatCard[];
  totals: Record<string, number>;
  fields: { name: string; operator: string; basin: string; lat: number; lon: number }[];
  taxonomy: { hazards: HazardMeta[]; eventTypes: HazardMeta[]; bands: RiskBand[] };
  llm: { status: string; model: string | null };
}

export interface HealthInfo {
  status: string;
  service: string;
  version: string;
  bootedAt: string;
  dataset: { seed: number; wells: number; events: number };
  llm: { status: string; model: string | null; offlineFallback: boolean };
  retrieval: { documents: number; byKind: Record<string, number>; index: string; vocabulary: number };
}

export interface TopEvent {
  type: Hazard;
  count: number;
}

export interface WellSummary {
  id: string;
  name: string;
  field: string;
  basin: string;
  state: string;
  operator: string;
  lat: number;
  lon: number;
  status: WellStatus;
  wellType: string;
  formation: string;
  reservoir: string;
  currentDepthMd: number;
  totalDepthMd: number;
  mudWeight: number;
  poreEmw: number;
  fracEmw: number;
  overbalancePpg: number;
  fracMarginPpg: number;
  lithology: string;
  rpm: number;
  wob: number;
  rop: number;
  flowRate: number;
  torque: number;
  bottomHoleTempC: number;
  riskScore: number;
  riskBand: RiskBand;
  eventCount: number;
  criticalEventCount: number;
  totalNptHours: number;
  totalCostUsd: number;
  spudDate: string;
  completionDate: string | null;
  isDeviated: boolean;
  targetInclination: number;
  topEvents: TopEvent[];
}

export interface FormationIntersection {
  name: string;
  topMd: number;
  baseMd: number;
  lithology: string;
  reservoir: string;
  porosity: number;
  permMd: number;
  poreEmw: number;
  fracEmw: number;
  primaryHazard: Hazard | null;
}

export interface WellEventLite {
  id: string;
  type: Hazard;
  label: string;
  formation: string;
  depth: number;
  severity: Severity;
  date: string;
  nptHours: number;
  costUsd: number;
  mitigation: string;
  outcome: Outcome;
  insight: string;
}

export interface TrajectoryStation {
  md: number;
  tvd: number;
  inc: number;
  azi: number;
  northing: number;
  easting: number;
  dls: number;
}

export interface Driver {
  feature: string;
  label: string;
  value: number;
  weight: number;
  impact: number;
  direction: 'increases' | 'reduces';
  share: number;
}

export interface SupportingIncident {
  id: string;
  wellId: string;
  wellName: string;
  formation: string;
  depth: number;
  severity: Severity;
  date: string;
  nptHours: number;
  mitigation: string;
  outcome: Outcome;
  depthDelta: number;
}

export interface SupportingWell {
  id: string;
  name: string;
  field: string;
  lat: number;
  lon: number;
  depth: number;
  severity: Severity;
  year: number;
}

export interface Prediction {
  wellId: string;
  hazard: Hazard;
  label: string;
  window: string;
  depth: number;
  formation: string;
  probability: number;
  probabilityPct: number;
  confidence: number;
  confidencePct: number;
  band: RiskBand;
  rationale: string;
  drivers: Driver[];
  topDrivers: Driver[];
  recommendedActions: string[];
  supportingIncidents: SupportingIncident[];
  supportingWells: SupportingWell[];
  inputs: Record<string, string | number>;
}

export interface RiskSummary {
  wellId: string;
  depth: number;
  composite: number;
  band: RiskBand;
  worst: {
    hazard: Hazard;
    label: string;
    probabilityPct: number;
    confidencePct: number;
    band: RiskBand;
  };
  predictions: {
    hazard: Hazard;
    label: string;
    probabilityPct: number;
    confidencePct: number;
    band: RiskBand;
    topDriver: Driver | null;
  }[];
  actions: string[];
  drivers: Driver[];
}

export interface PredictionWindow {
  key: string;
  label: string;
  depth: number;
  predictions: Prediction[];
  worst: Prediction;
}

export interface WellDetail extends WellSummary {
  lessonsLearned: {
    eventType: Hazard;
    formation: string;
    depth: number;
    severity: Severity;
    outcome: Outcome;
    text: string;
    nptHours: number;
  }[];
  formations: FormationIntersection[];
  trajectory: TrajectoryStation[];
  events: WellEventLite[];
  riskSummary: RiskSummary;
}

export interface WellRiskPayload {
  summary: RiskSummary;
  predictions: Prediction[];
  windows: PredictionWindow[];
  modelCard: ModelCard;
  sequenceAnalogues: Record<string, { wellId: string; name: string; score: number; formation: string; events: number }[]>;
}

export interface ModelCard {
  name: string;
  version: string;
  structural: string;
  trainingCorpus: string;
  hazards: { hazard: Hazard; label: string; rationale: string }[];
  featureImportance: { feature: string; label: string; importance: number; importancePct: number }[];
  calibration: string;
  serving: string;
}

export interface DepthSample {
  depth: number;
  band: RiskBand;
  formation: string;
  weighted: number;
  aggregate: number;
  hazards: Record<Hazard, number>;
  [key: string]: number | string | Record<Hazard, number>;
}

export interface DepthProfile {
  wellId: string;
  top: number;
  bottom: number;
  step: number;
  hazards: Hazard[];
  samples: ({
    depth: number;
    aggregate: number;
    weighted: number;
    band: RiskBand;
    formation: string;
  } & Record<string, number | string>)[];
  bands: {
    depth: number;
    band: RiskBand;
    formation: string;
    weighted: number;
    hazards: Record<Hazard, number>;
  }[];
  criticalBands: unknown[];
}

export interface SimilarityGroup {
  group: string;
  label: string;
  score: number;
  weight: number;
}

export interface SimilarWell {
  wellId: string;
  name: string;
  field: string;
  operator: string;
  basin: string;
  lat: number;
  lon: number;
  status: WellStatus;
  formation: string;
  totalDepthMd: number;
  riskBand: RiskBand;
  riskScore: number;
  distanceKm: number;
  similarity: number;
  groups: SimilarityGroup[];
  sharedEvents: {
    type: Hazard;
    label: string;
    formation: string;
    depth: number;
    severity: Severity;
    mitigation: string;
    outcome: Outcome;
    nptHours: number;
  }[];
  lessonsLearned: {
    eventType: Hazard;
    label: string;
    text: string;
    outcome: Outcome;
    severity: Severity;
    depth: number;
    formation: string;
  }[];
  eventCount: number;
  criticalEventCount: number;
  totalNptHours: number;
}

export interface SimilarityPayload {
  well: WellSummary;
  matches: SimilarWell[];
  network: NetworkPayload;
  method: { groups: { key: string; label: string; weight: number }[]; note: string };
}

export interface NetworkNode {
  id: string;
  name: string;
  kind: string;
  formation: string;
  similarity: number;
  riskBand: RiskBand;
  lat: number;
  lon: number;
  depth: number;
}

export interface NetworkPayload {
  focus: string;
  nodes: NetworkNode[];
  edges: { source: string; target: string; weight: number; similarity: number; secondary?: boolean }[];
}

export interface TelemetryChannel {
  key: string;
  label: string;
  unit: string;
  precision: number;
  value: number;
}

export interface TelemetrySnapshot {
  wellId: string;
  wellName: string;
  formation: string;
  timestamp: number;
  intervalSeconds: number;
  current: Record<string, number>;
  channels: TelemetryChannel[];
  history: { t: number; depth: number; rop: number; wob: number; rpm: number; torque: number; spp: number; gas: number }[];
  alarms: { channel: string; level: string; message: string }[];
  status: 'NORMAL' | 'WARNING' | 'CRITICAL';
}

export interface FormationRecord {
  name: string;
  basin: string;
  lithology: string;
  reservoir: string;
  porosity: number | null;
  permMd: number | null;
  poreEmw: number | null;
  fracEmw: number | null;
  depthRange: (number | null)[];
  headline: string;
  wellCount: number;
  eventCount: number;
  hazardRate: number;
  riskBand: RiskBand;
  intelligenceScore: number;
  hazardCounts: Record<string, number>;
  hazardRates: Record<string, number>;
  windows: {
    hazard: Hazard;
    label: string;
    low: number;
    high: number;
    count: number;
    median: number;
    share: number;
  }[];
  primaryHazard: {
    hazard: Hazard;
    label: string;
    low: number;
    high: number;
    count: number;
    median: number;
    share: number;
  } | null;
  mitigations: {
    eventType: Hazard;
    label: string;
    strategy: string;
    attempts: number;
    successRate: number;
    avgNpt: number;
    outcomes: Record<string, number>;
    score: number;
  }[];
  bestMitigation: {
    eventType: Hazard;
    label: string;
    strategy: string;
    attempts: number;
    successRate: number;
    avgNpt: number;
  } | null;
  bestByHazard: {
    eventType: Hazard;
    label: string;
    strategy: string;
    attempts: number;
    successRate: number;
    avgNpt: number;
  }[];
  severityMix: Record<Severity, number>;
  timeline: { year: number; events: number }[];
  totalNptHours: number;
  totalCostUsd: number;
  offsetWells: {
    id: string;
    name: string;
    field: string;
    operator: string;
    year: string;
    riskBand: RiskBand;
    riskScore: number;
    events: number;
    primaryEvent: Hazard | null;
  }[];
  summary: string;
  depthHistogram?: { depth: number; label: string; total: number } & Record<string, number | string>[];
  analogueWells?: {
    id: string;
    name: string;
    field: string;
    operator: string;
    status: WellStatus;
    riskBand: RiskBand;
    riskScore: number;
    depth: number;
    eventTypes: Hazard[];
    eventCount: number;
    worstEvent: {
      label: string;
      severity: Severity;
      depth: number;
      mitigation: string;
      outcome: Outcome;
    } | null;
    lat: number;
    lon: number;
    year: string;
  }[];
}

export interface IncidentRow {
  id: string;
  wellId: string;
  wellName: string;
  field: string;
  basin: string;
  operator: string;
  lat: number;
  lon: number;
  type: Hazard;
  label: string;
  formation: string;
  depth: number;
  severity: Severity;
  date: string;
  nptHours: number;
  costUsd: number;
  mitigation: string;
  outcome: Outcome;
  insight: string;
  samples: number;
}

export interface ReplaySample {
  t: number;
  md: number;
  torque: number;
  mudWeight: number;
  spp: number;
  rop: number;
  hookload: number;
  pitVolume: number;
  gas: number;
  action: string | null;
}

export interface IncidentDetail {
  id: string;
  type: Hazard;
  label: string;
  well: WellSummary;
  formation: string;
  depth: number;
  severity: Severity;
  date: string;
  nptHours: number;
  costUsd: number;
  mitigation: string;
  outcome: Outcome;
  insight: string;
  mudWeightBefore: number;
  mudWeightAfter: number;
  replay: { samples: ReplaySample[]; actions: { at: number; label: string }[]; signature: string[] };
  lessons: WellDetail['lessonsLearned'];
  related: {
    id: string;
    wellId: string;
    wellName: string;
    depth: number;
    severity: Severity;
    date: string;
    outcome: Outcome;
  }[];
}

export interface Alert {
  id: string;
  wellId: string;
  wellName: string;
  field: string;
  basin: string;
  operator: string;
  lat: number;
  lon: number;
  hazard: Hazard;
  label: string;
  severity: Severity;
  probabilityPct: number;
  confidencePct: number;
  band: RiskBand;
  depth: number;
  formation: string;
  patternMatch: {
    wellId: string;
    wellName: string;
    depth: number;
    severity: Severity;
    date: string;
    mitigation: string;
    outcome: Outcome;
    depthDelta: number;
  } | null;
  recommendedAction: string;
  playbook: string[];
  drivers: Driver[];
  supportingIncidents: SupportingIncident[];
  analogues: { wellId: string; name: string; score: number; formation: string; events: number }[];
  title: string;
}

export interface AlertsPayload {
  count: number;
  counts: Record<string, number>;
  alerts: Alert[];
  threshold: number;
}

export interface NearbyWell {
  id: string;
  name: string;
  field: string;
  operator: string;
  status: WellStatus;
  basin: string;
  lat: number;
  lon: number;
  formation: string;
  totalDepthMd: number;
  currentDepthMd: number;
  riskScore: number;
  riskBand: RiskBand;
  eventCount: number;
  criticalEventCount: number;
  distanceKm: number;
  spudDate: string;
  completionDate: string | null;
  mudWeight: number;
  topEvents: [Hazard, number][];
}

export interface KpiCard {
  key: string;
  label: string;
  value: number;
  unit: string;
  sub: string;
  tone: string;
  progress?: number;
}

export interface KpisPayload {
  focusWell: WellSummary;
  cards: KpiCard[];
  riskSummary: RiskSummary;
  alerts: Alert[];
  nearby: NearbyWell[];
  analogues: SimilarWell[];
}

export interface WhatIfPayload {
  wellId: string;
  wellName: string;
  depth: number;
  formation: string;
  baseline: Record<string, number>;
  scenario: Record<string, number>;
  changed: Record<string, { before: number; after: number }>;
  deltas: {
    hazard: Hazard;
    before: number;
    after: number;
    delta: number;
    deltaPct: number;
    direction: 'up' | 'down' | 'flat';
    label: string;
  }[];
  charts: {
    parameter: string;
    label: string;
    unit: string;
    baseline: number;
    current: number;
    points: {
      x: number;
      mudLoss: number;
      kick: number;
      stuckPipe: number;
      torqueSpike: number;
      overpressure: number;
      cementing: number;
      composite: number;
    }[];
  }[];
  verdict: string;
  ranges: Record<string, { label: string; unit: string; min: number; max: number; step: number; key: string }>;
}

export interface GraphPayload {
  focus: string;
  nodes: {
    id: string;
    kind: 'well' | 'formation' | 'hazard' | 'reservoir' | 'mitigation' | 'operator';
    label: string;
    degree: number;
    focus?: boolean;
    riskBand?: RiskBand;
    status?: string;
    similarity?: number | null;
    basin?: string;
    hazard?: Hazard;
    successRate?: number;
    attempts?: number;
    focusFormation?: boolean;
  }[];
  edges: {
    id: string;
    source: string;
    target: string;
    relation: string;
    weight: number;
    label?: string;
    count?: number;
    successRate?: number;
    attempts?: number;
    depth?: number;
    severity?: Severity;
  }[];
  stats: { nodes: number; edges: number; byKind: Record<string, number>; byRelation: Record<string, number> };
}

export interface MemoryPayload {
  wellId: string;
  wellName: string;
  score: number;
  grade: string;
  metrics: { key: string; label: string; value: number; unit: string; tone: string }[];
  breakdown: { component: string; contribution: number; max: number }[];
  perHazard: { hazard: Hazard; label: string; probabilityPct: number; supportingIncidents: number; supportingWells: number; confidencePct: number }[];
  narrative: string;
  evidenceSample: {
    id: string;
    wellId: string;
    wellName: string;
    type: Hazard;
    label: string;
    formation: string;
    depth: number;
    severity: Severity;
    date: string;
    mitigation: string;
    outcome: Outcome;
  }[];
}

export interface AnalyticsPayload {
  totals: Record<string, number>;
  hazardFrequency: {
    hazard: Hazard;
    label: string;
    count: number;
    share: number;
    nptHours: number;
    costUsd: number;
    avgDepth: number;
    criticalCount: number;
  }[];
  incidentsByFormation: (Record<string, number | string> & { formation: string; total: number; band: RiskBand })[];
  eventsByYear: { year: number; events: number; nptHours: number }[];
  successRate: { name: string; value: number; share: number }[];
  formationSuccess: { formation: string; attempts: number; successRate: number; failureRate: number }[];
  severityMix: { name: string; value: number; order: number }[];
  basinMix: (Record<string, number | string> & { basin: string; total: number })[];
  formationRiskRanking: {
    formation: string;
    basin: string;
    eventCount: number;
    wellCount: number;
    hazardRate: number;
    intelligenceScore: number;
    band: RiskBand;
    primaryHazard: Hazard | null;
    primaryHazardLabel: string | null;
    window: number | null;
    totalNptHours: number;
  }[];
  depthDistribution: (Record<string, number | string> & { depth: number; label: string; total: number })[];
  topRiskWells: {
    id: string;
    name: string;
    field: string;
    basin: string;
    status: WellStatus;
    riskScore: number;
    riskBand: RiskBand;
    eventCount: number;
    totalNptHours: number;
    totalCostUsd: number;
  }[];
}

export interface ReportPayload {
  generatedAt: string;
  preparedBy: string;
  reportId: string;
  well: ReportWell;
  narrative: string;
  risk: RiskSummary;
  windows: PredictionWindow[];
  formations: (FormationIntersection & {
    interval: string;
    primaryHazard: string;
    window: string;
    events: number;
    intelligence: number;
    headline: string;
  })[];
  nearbyWells: NearbyWell[];
  similarWells: SimilarWell[];
  predictedRisks: RiskSummary['predictions'];
  criticalBands: { depth: number; band: RiskBand; formation: string; weighted: number }[];
  recommendations: string[];
  memory: MemoryPayload;
  evidence: MemoryPayload['evidenceSample'];
  totals: { nearbyEvents: number; nearbyNptHours: number; analogueNptHours: number };
}

export interface ReportWell {
  id: string;
  name: string;
  field: string;
  basin: string;
  state: string;
  operator: string;
  status: WellStatus;
  wellType: string;
  spudDate: string;
  completionDate: string | null;
  lat: number;
  lon: number;
  totalDepthMd: number;
  currentDepthMd: number;
  formation: string;
  reservoir: string;
  lithology: string;
  mudWeight: number;
  poreEmw: number;
  fracEmw: number;
  rpm: number;
  wob: number;
  rop: number;
  flowRate: number;
  torque: number;
  bottomHoleTempC: number;
  riskScore: number;
  riskBand: RiskBand;
}

export interface TwinPayload {
  activeWell: {
    id: string;
    name: string;
    field: string;
    basin: string;
    operator: string;
    formation: string;
    totalDepthMd: number;
    currentDepthMd: number;
    kopMd: number;
    targetInclination: number;
    targetAzimuth: number;
    riskBand: RiskBand;
    riskScore: number;
    mudWeight: number;
    poreEmw: number;
    fracEmw: number;
  };
  trajectory: TrajectoryStation[];
  plannedTrajectory: TrajectoryStation[];
  formationZones: {
    name: string;
    top: number;
    base: number;
    lithology: string;
    reservoir: string;
    poreEmw: number;
    fracEmw: number;
    primaryHazard: Hazard | null;
    riskBand: RiskBand;
  }[];
  riskBands: { depth: number; band: RiskBand; formation: string; weighted: number; hazards: Record<Hazard, number> }[];
  nearbyWells: {
    id: string;
    name: string;
    lat: number;
    lon: number;
    dx: number;
    dy: number;
    status: WellStatus;
    riskBand: RiskBand;
    totalDepthMd: number;
    formation: string;
    distanceKm: number;
    trajectory: TrajectoryStation[];
  }[];
  reservoir: { name: string; porosity: number; permMd: number };
}

export interface CopilotConfig {
  status: string;
  model: string;
  provider: string;
  offlineFallback: boolean;
  suggestions: { id: string; text: string; textHi: string; icon: string }[];
  retrieval: { documents: number; byKind: Record<string, number>; index: string; vocabulary: number };
  capabilities: string[];
}

export interface CopilotSource {
  index: number;
  docId: string;
  kind: string;
  title: string;
  wellId: string | null;
  score: number;
  metadata: Record<string, unknown>;
}

export interface CopilotMeta {
  type: 'meta';
  provider: string;
  model: string;
  focusWell: Record<string, string | number>;
  risk: RiskSummary;
  sources: CopilotSource[];
  evidence: { docId: string; kind: string; title: string; text: string }[];
}

export type CopilotChunk =
  | CopilotMeta
  | { type: 'delta'; text: string }
  | { type: 'notice'; message: string }
  | { type: 'error'; message: string }
  | { type: 'done'; provider: string; model?: string };

export interface DatasetCatalogue {
  sources: { id: string; name: string; format: string; records: number; status: string }[];
  retrieval: HealthInfo['retrieval'];
}
