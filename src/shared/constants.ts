export type Archetype =
  | "failure-laundering"
  | "engagement-farming"
  | "status-packaging"
  | "ai-sludge"
  | "consensus-wisdom";

export const ARCHETYPES: readonly Archetype[] = [
  "failure-laundering",
  "engagement-farming",
  "status-packaging",
  "ai-sludge",
  "consensus-wisdom",
] as const;

export const ARCHETYPE_LABELS: Record<Archetype, string> = {
  "failure-laundering": "Failure Laundering",
  "engagement-farming": "Engagement Farming",
  "status-packaging": "Status Packaging",
  "ai-sludge": "AI Sludge",
  "consensus-wisdom": "Consensus Wisdom",
};

export const ARCHETYPE_COLORS: Record<Archetype, string> = {
  "failure-laundering": "#ef4444",
  "engagement-farming": "#f97316",
  "status-packaging": "#a855f7",
  "ai-sludge": "#3b82f6",
  "consensus-wisdom": "#6b7280",
};

export const ARCHETYPE_EMOJIS: Record<Archetype, string> = {
  "failure-laundering": "🪣",
  "engagement-farming": "🎣",
  "status-packaging": "📦",
  "ai-sludge": "🤖",
  "consensus-wisdom": "🧘",
};

export const DEFAULT_API_URL = "https://decoded-api.replit.app/api";
export const FREE_DAILY_LIMIT = 5;
export const UPGRADE_URL = "https://decoded.app/upgrade";

export interface Settings {
  enabled: boolean;
  showAIScore: boolean;
  autoCollapseEngagementBait: boolean;
  showCommentLabels: boolean;
  showArchetypeLabels: boolean;
  inlineMode: boolean;
  apiUrl: string;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  showAIScore: true,
  autoCollapseEngagementBait: true,
  showCommentLabels: true,
  showArchetypeLabels: true,
  inlineMode: false,
  apiUrl: DEFAULT_API_URL,
};

export type RuntimeMessage =
  | { type: "SETTINGS_CHANGED" }
  | { type: "USAGE_UPDATED"; count: number }
  | { type: "GET_USAGE" }
  | { type: "DECODE_HOVERED" };

export interface UsageResponse {
  count: number;
  limit: number;
}

export function getScoreColor(score: number): string {
  if (score > 70) return "#ef4444";
  if (score > 35) return "#f97316";
  return "#22c55e";
}

export function getArchetypeLabel(archetype: Archetype): string {
  return ARCHETYPE_LABELS[archetype];
}
