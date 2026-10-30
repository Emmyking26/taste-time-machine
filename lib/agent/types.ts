import type {
  AnchorResolution,
  QlooEntity,
  QlooRequestRecord,
  QlooTag,
  ResolutionState,
  TagResolution,
} from "@/lib/qloo";

export type ItemType = "music" | "film" | "tv" | "food" | "conversation";

export type Provenance = "caregiver" | "qloo" | "agent";

export type CaregiverReaction = "lit_up" | "calm" | "engaged" | "no_response" | "agitated" | "unknown";

export type HistoricalStatus =
  | "inside_period"
  | "outside_period"
  | "era_tag"
  | "not_date_verifiable"
  | "unknown";

/**
 * A normalized, auditable piece of Qloo evidence.
 * The original Qloo tag is kept under metadata.raw; nothing is rewritten.
 */
export interface CulturalSignal {
  source: "qloo";
  name: string;
  id?: string;
  namespace?: string;
  type?: string;
  affinity?: number;
  popularity?: number;
  sourceEntity?: string;
  metadata?: Record<string, unknown>;
}

export interface CaregiverFeedback {
  sessionItemId: string;
  reaction: CaregiverReaction;
  note?: string;
  createdAt: string;
}

export interface SessionItem {
  id: string;
  type: ItemType;
  title: string;
  entityId?: string;
  year?: number;
  reason: string;
  provenance: Provenance;
  confidence?: number;
  durationMinutes?: number;
  entityType?: string;
  signalNames?: string[];
  historicalStatus?: HistoricalStatus;
  evidenceIds?: string[];
  safetyNote?: string;
}

export interface Session {
  id: string;
  createdAt: string;
  durationMinutes: number;
  status: "planned" | "completed" | "stopped";
  items: SessionItem[];
  caregiverFeedback?: CaregiverFeedback[];
  safetyNotes?: string[];
  /** The adaptation context used when this session was generated. */
  adaptation?: SessionAdaptation;
}

export interface Anchor {
  id: string;
  text: string;
  entityId: string | null;
  name: string | null;
  entityType: string | null;
  state: ResolutionState;
  confidence: number;
  provenance: "caregiver";
  tagId?: string;
  tagName?: string;
  tagState?: ResolutionState;
  resolution?: AnchorResolution;
  tagResolution?: TagResolution;
}

export interface LearnedPreference {
  signal: string;
  evidence: "caregiver_feedback";
  reaction: CaregiverReaction;
  /** Magnitude of the observation, 0..1. This is not a clinical measurement. */
  strength: number;
  /** Direction of the observation, -1..1. */
  tone: number;
  updatedAt: string;
  kind?: "signal" | "entity";
  entityId?: string;
  sessionId?: string;
  sessionItemId?: string;
  adjacentSignals?: string[];
}

export interface QlooAuditEntry {
  id: string;
  tool: string;
  request: QlooRequestRecord;
  response: unknown;
  createdAt: string;
}

export interface PersonProfile {
  id: string;
  name: string;
  birthYear: number;
  hometown: {
    city: string;
    state?: string;
    country: string;
  };
  formativePeriod: {
    startYear: number;
    endYear: number;
  };
  caregiverKnown: {
    rememberedInterests: string[];
    notes?: string;
    rememberedMusic?: string[];
    rememberedMovies?: string[];
    rememberedTvShows?: string[];
    rememberedFoods?: string[];
    rememberedPlaces?: string[];
  };
  anchors: Anchor[];
  discoveredSignals: CulturalSignal[];
  sessionHistory: Session[];
  preferencesLearned: LearnedPreference[];
  createdAt: string;
  updatedAt: string;
  /** Raw Qloo responses retained for audit/debugging. */
  qlooAudit?: QlooAuditEntry[];
}

export interface AgentCandidate {
  id: string;
  type: ItemType;
  title: string;
  entityId?: string;
  entityType?: string;
  year?: number;
  affinity?: number;
  popularity?: number;
  tags: string[];
  signalNames: string[];
  provenance: Provenance;
  historicalStatus: HistoricalStatus;
  geographicContext?: string;
  reasonSeed: string;
  qlooExplainability?: unknown;
  auditId?: string;
  rawEntity?: QlooEntity;
}

export interface CandidateScoreComponents {
  affinity: number;
  historicalFit: number;
  geographicFit: number;
  caregiverRelevance: number;
  /** Small familiarity bonus for an explicitly caregiver-known item. */
  caregiverAnchorBonus: number;
  novelty: number;
  categoryFit: number;
  feedback: number;
}

export interface CandidateEvaluation {
  candidateId: string;
  category: ItemType;
  eligible: boolean;
  suppressed: boolean;
  score: number;
  components: CandidateScoreComponents;
  reasons: string[];
  warnings: string[];
  provenance: Provenance;
  matchedSignals: string[];
  suppressedBy?: string[];
}

export interface ResolveAnchorToolResult {
  text: string;
  state: ResolutionState;
  entity: QlooEntity | null;
  entityType: string | null;
  confidence: number;
  matchType: string;
  notes: string[];
  candidates: QlooEntity[];
  tag: QlooTag | null;
  tagState: ResolutionState;
  tagCandidates: QlooTag[];
  auditIds: string[];
  resolution: AnchorResolution;
  tagResolution: TagResolution | null;
}

export interface DiscoverSignalsToolResult {
  signals: CulturalSignal[];
  limitations: string[];
  auditIds: string[];
}

export interface FindCandidatesToolResult {
  category: ItemType;
  candidates: AgentCandidate[];
  limitations: string[];
  auditIds: string[];
}

export interface GeneratedEvidence {
  caregiverKnown: unknown[];
  qlooEvidence: unknown[];
  agentHypotheses: unknown[];
}

export interface SessionAdaptation {
  feedbackApplied: boolean;
  likedSignals: string[];
  avoidedSignals: string[];
  replayedItemsAvoided: string[];
  summary: string;
}

export interface GeneratedSessionResult {
  session: Session;
  evidence: GeneratedEvidence;
  reasoningSummary: string;
  limitations: string[];
  adaptation: SessionAdaptation;
}

export interface FeedbackInput {
  sessionItemId: string;
  reaction: CaregiverReaction;
  note?: string;
}

export interface FeedbackResult {
  profile: PersonProfile;
  learnedPreferences: LearnedPreference[];
  safety: {
    shouldStop: boolean;
    guidance: string;
  };
}
