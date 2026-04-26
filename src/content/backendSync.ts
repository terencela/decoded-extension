import type { Archetype, Settings } from "../shared/constants";
import type { AuthorScore, HistoryEntry } from "./storage";

const INSTALL_ID_KEY = "install_id";
const REQUEST_TIMEOUT_MS = 4500;

export type BackendEventType =
  | "install"
  | "decode"
  | "author_score"
  | "follow_author"
  | "email_opt_in";

export type PlatformSource = "linkedin" | "twitter";

export interface BackendResult {
  ok: boolean;
  skipped?: boolean;
  status?: number;
}

interface BackendConfig {
  endpoint: string;
  anonKey: string;
}

function getConfig(settings: Settings): BackendConfig | null {
  if (!settings.backendSyncEnabled) return null;
  const rawEndpoint = settings.backendUrl.trim();
  const anonKey = settings.backendAnonKey.trim();
  if (!rawEndpoint || !anonKey) return null;
  try {
    const parsed = new URL(rawEndpoint);
    if (parsed.protocol !== "https:") return null;
    return { endpoint: parsed.origin, anonKey };
  } catch {
    return null;
  }
}

function rpcUrl(endpoint: string): string {
  return `${endpoint}/rest/v1/rpc/ingest_extension_event`;
}

export async function getOrCreateInstallId(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get([INSTALL_ID_KEY], (result) => {
      const existing = typeof result[INSTALL_ID_KEY] === "string" ? result[INSTALL_ID_KEY] : "";
      if (existing) {
        resolve(existing);
        return;
      }

      const installId = crypto.randomUUID();
      chrome.storage.local.set({ [INSTALL_ID_KEY]: installId }, () => resolve(installId));
    });
  });
}

async function postWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function ingestBackendEvent(
  settings: Settings,
  eventType: BackendEventType,
  payload: Record<string, unknown> = {},
): Promise<BackendResult> {
  const config = getConfig(settings);
  if (!config) return { ok: false, skipped: true };

  const installId = await getOrCreateInstallId();
  try {
    const response = await postWithTimeout(rpcUrl(config.endpoint), {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        authorization: `Bearer ${config.anonKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        p_install_id: installId,
        p_event_type: eventType,
        p_payload: {
          ...payload,
          version: chrome.runtime.getManifest().version,
        },
      }),
    });

    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false };
  }
}

export async function syncInstall(settings: Settings, referrer?: string): Promise<BackendResult> {
  return ingestBackendEvent(settings, "install", {
    referrer,
    userAgent: navigator.userAgent,
  });
}

export async function syncDecodeEvent(
  settings: Settings,
  entry: Omit<HistoryEntry, "decodedAt">,
): Promise<BackendResult> {
  return ingestBackendEvent(settings, "decode", {
    source: entry.source,
    archetype: entry.archetype,
    aiScore: entry.aiScore,
    hash: entry.hash,
  });
}

function dominantArchetype(score: AuthorScore): Archetype | undefined {
  return Object.entries(score.archetypeCounts)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] as Archetype | undefined;
}

export async function syncAuthorScore(
  settings: Settings,
  score: AuthorScore,
): Promise<BackendResult> {
  return ingestBackendEvent(settings, "author_score", {
    source: score.source,
    author: score.author,
    authorHandle: score.handle,
    totalAIScore: score.totalAIScore,
    postCount: score.postCount,
    dominantArchetype: dominantArchetype(score),
  });
}

export async function syncFollowedAuthor(
  settings: Settings,
  source: PlatformSource,
  author: string,
  authorHandle?: string,
): Promise<BackendResult> {
  return ingestBackendEvent(settings, "follow_author", {
    source,
    author,
    authorHandle,
  });
}

export async function syncEmailOptIn(
  settings: Settings,
  email: string,
): Promise<BackendResult> {
  return ingestBackendEvent(settings, "email_opt_in", { email });
}
