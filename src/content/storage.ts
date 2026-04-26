import { DEFAULT_SETTINGS, FREE_DAILY_LIMIT, type Settings, type Archetype } from "../shared/constants";

export type { Settings } from "../shared/constants";
export { FREE_DAILY_LIMIT } from "../shared/constants";

export interface DailyUsage {
  count: number;
  date: string;
}

export interface FlaggedTranslation {
  hash: string;
  text: string;
  translation: string;
  archetype: string;
  reason?: string;
  flaggedAt: number;
}

export interface HistoryEntry {
  hash: string;
  excerpt: string;
  translation: string;
  archetype: Archetype;
  aiScore: number;
  source: "linkedin" | "twitter";
  author?: string;
  authorHandle?: string;
  decodedAt: number;
}

export interface AuthorScore {
  author: string;
  handle?: string;
  source: "linkedin" | "twitter";
  totalAIScore: number;
  postCount: number;
  archetypeCounts: Partial<Record<Archetype, number>>;
  lastSeen: number;
}

export interface FollowedAuthor {
  author: string;
  handle?: string;
  source: "linkedin" | "twitter";
  followedAt: number;
}

const FLAGGED_KEY = "flagged_translations";
const HISTORY_KEY = "decode_history";
const AUTHOR_KEY = "author_scores";
const FOLLOWED_AUTHORS_KEY = "followed_authors";
const MAX_FLAGGED = 100;
const MAX_HISTORY = 50;
const MAX_AUTHORS = 500;
const MAX_FOLLOWED_AUTHORS = 100;

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

export async function getSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.local.get(["settings"], (result) => {
      resolve({ ...DEFAULT_SETTINGS, ...(result.settings || {}) });
    });
  });
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  return new Promise((resolve) => {
    chrome.storage.local.set({ settings: { ...current, ...settings } }, resolve);
  });
}

export async function getDailyUsage(): Promise<DailyUsage> {
  return new Promise((resolve) => {
    chrome.storage.local.get(["usage"], (result) => {
      const usage = result.usage as DailyUsage | undefined;
      if (!usage || usage.date !== todayString()) {
        resolve({ count: 0, date: todayString() });
      } else {
        resolve(usage);
      }
    });
  });
}

export async function incrementDailyUsage(): Promise<number> {
  const usage = await getDailyUsage();
  const newCount = usage.count + 1;
  return new Promise((resolve) => {
    chrome.storage.local.set({ usage: { count: newCount, date: todayString() } }, () => {
      resolve(newCount);
    });
  });
}

export async function canDecode(): Promise<boolean> {
  const usage = await getDailyUsage();
  return usage.count < FREE_DAILY_LIMIT;
}

export async function getCachedResult(
  postHash: string
): Promise<{ translation: string; archetype: string } | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get([`cache_${postHash}`], (result) => {
      const cached = result[`cache_${postHash}`];
      if (cached && cached.expiresAt > Date.now()) {
        resolve(cached.data);
      } else {
        resolve(null);
      }
    });
  });
}

export async function setCachedResult(
  postHash: string,
  data: { translation: string; archetype: string }
): Promise<void> {
  return new Promise((resolve) => {
    const entry = {
      data,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    chrome.storage.local.set({ [`cache_${postHash}`]: entry }, resolve);
  });
}

export function hashText(text: string): string {
  let h = 0;
  for (let i = 0; i < Math.min(text.length, 500); i++) {
    const char = text.charCodeAt(i);
    h = (h << 5) - h + char;
    h = h & h;
  }
  return Math.abs(h).toString(36);
}

export async function flagTranslation(entry: Omit<FlaggedTranslation, "flaggedAt">): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get([FLAGGED_KEY], (result) => {
      const existing: FlaggedTranslation[] = Array.isArray(result[FLAGGED_KEY])
        ? result[FLAGGED_KEY]
        : [];
      const next = [{ ...entry, flaggedAt: Date.now() }, ...existing].slice(0, MAX_FLAGGED);
      chrome.storage.local.set({ [FLAGGED_KEY]: next }, () => resolve());
    });
  });
}

export async function getFlaggedTranslations(): Promise<FlaggedTranslation[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([FLAGGED_KEY], (result) => {
      resolve(Array.isArray(result[FLAGGED_KEY]) ? result[FLAGGED_KEY] : []);
    });
  });
}

export async function addToHistory(entry: Omit<HistoryEntry, "decodedAt">): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get([HISTORY_KEY], (result) => {
      const existing: HistoryEntry[] = Array.isArray(result[HISTORY_KEY])
        ? result[HISTORY_KEY]
        : [];
      // De-dupe by hash; keep newest
      const filtered = existing.filter((h) => h.hash !== entry.hash);
      const next = [{ ...entry, decodedAt: Date.now() }, ...filtered].slice(0, MAX_HISTORY);
      chrome.storage.local.set({ [HISTORY_KEY]: next }, () => resolve());
    });
  });
}

export async function getHistory(): Promise<HistoryEntry[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([HISTORY_KEY], (result) => {
      resolve(Array.isArray(result[HISTORY_KEY]) ? result[HISTORY_KEY] : []);
    });
  });
}

export async function clearHistory(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove([HISTORY_KEY], () => resolve());
  });
}

export function authorKey(author: string, source: "linkedin" | "twitter"): string {
  return `${source}::${author.toLowerCase().trim()}`;
}

export async function recordAuthorScore(
  author: string,
  archetype: Archetype,
  aiScore: number,
  source: "linkedin" | "twitter",
  handle?: string,
): Promise<AuthorScore | null> {
  if (!author || author.length < 2) return null;
  return new Promise((resolve) => {
    chrome.storage.local.get([AUTHOR_KEY], (result) => {
      const existing: Record<string, AuthorScore> =
        result[AUTHOR_KEY] && typeof result[AUTHOR_KEY] === "object"
          ? (result[AUTHOR_KEY] as Record<string, AuthorScore>)
          : {};
      const key = authorKey(author, source);
      const prior = existing[key];
      const next: AuthorScore = prior
        ? {
            ...prior,
            handle: prior.handle ?? handle,
            totalAIScore: prior.totalAIScore + aiScore,
            postCount: prior.postCount + 1,
            archetypeCounts: {
              ...prior.archetypeCounts,
              [archetype]: (prior.archetypeCounts[archetype] ?? 0) + 1,
            },
            lastSeen: Date.now(),
          }
        : {
            author,
            handle,
            source,
            totalAIScore: aiScore,
            postCount: 1,
            archetypeCounts: { [archetype]: 1 },
            lastSeen: Date.now(),
          };
      existing[key] = next;

      // Cap total tracked authors by trimming oldest if over limit
      const allKeys = Object.keys(existing);
      if (allKeys.length > MAX_AUTHORS) {
        const sorted = allKeys
          .map((k) => [k, existing[k].lastSeen] as const)
          .sort((a, b) => b[1] - a[1])
          .slice(0, MAX_AUTHORS);
        const trimmed: Record<string, AuthorScore> = {};
        for (const [k] of sorted) trimmed[k] = existing[k];
        chrome.storage.local.set({ [AUTHOR_KEY]: trimmed }, () => resolve(next));
        return;
      }
      chrome.storage.local.set({ [AUTHOR_KEY]: existing }, () => resolve(next));
    });
  });
}

export async function getAuthorScore(
  author: string,
  source: "linkedin" | "twitter",
): Promise<AuthorScore | null> {
  if (!author) return null;
  return new Promise((resolve) => {
    chrome.storage.local.get([AUTHOR_KEY], (result) => {
      const map = (result[AUTHOR_KEY] || {}) as Record<string, AuthorScore>;
      resolve(map[authorKey(author, source)] ?? null);
    });
  });
}

export async function getAllAuthorScores(): Promise<AuthorScore[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([AUTHOR_KEY], (result) => {
      const map = (result[AUTHOR_KEY] || {}) as Record<string, AuthorScore>;
      resolve(Object.values(map));
    });
  });
}

export async function clearAuthorScores(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove([AUTHOR_KEY], () => resolve());
  });
}

export async function followAuthor(
  author: string,
  source: "linkedin" | "twitter",
  handle?: string,
): Promise<FollowedAuthor | null> {
  if (!author || author.length < 2) return null;
  return new Promise((resolve) => {
    chrome.storage.local.get([FOLLOWED_AUTHORS_KEY], (result) => {
      const existing: Record<string, FollowedAuthor> =
        result[FOLLOWED_AUTHORS_KEY] && typeof result[FOLLOWED_AUTHORS_KEY] === "object"
          ? (result[FOLLOWED_AUTHORS_KEY] as Record<string, FollowedAuthor>)
          : {};
      const key = authorKey(author, source);
      const entry: FollowedAuthor = {
        author,
        handle,
        source,
        followedAt: Date.now(),
      };
      existing[key] = entry;

      const keys = Object.keys(existing);
      if (keys.length > MAX_FOLLOWED_AUTHORS) {
        const sorted = keys
          .map((k) => [k, existing[k].followedAt] as const)
          .sort((a, b) => b[1] - a[1])
          .slice(0, MAX_FOLLOWED_AUTHORS);
        const trimmed: Record<string, FollowedAuthor> = {};
        for (const [k] of sorted) trimmed[k] = existing[k];
        chrome.storage.local.set({ [FOLLOWED_AUTHORS_KEY]: trimmed }, () => resolve(entry));
        return;
      }

      chrome.storage.local.set({ [FOLLOWED_AUTHORS_KEY]: existing }, () => resolve(entry));
    });
  });
}

export async function unfollowAuthor(
  author: string,
  source: "linkedin" | "twitter",
): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get([FOLLOWED_AUTHORS_KEY], (result) => {
      const existing: Record<string, FollowedAuthor> =
        result[FOLLOWED_AUTHORS_KEY] && typeof result[FOLLOWED_AUTHORS_KEY] === "object"
          ? (result[FOLLOWED_AUTHORS_KEY] as Record<string, FollowedAuthor>)
          : {};
      delete existing[authorKey(author, source)];
      chrome.storage.local.set({ [FOLLOWED_AUTHORS_KEY]: existing }, () => resolve());
    });
  });
}

export async function isFollowingAuthor(
  author: string,
  source: "linkedin" | "twitter",
): Promise<boolean> {
  if (!author) return false;
  return new Promise((resolve) => {
    chrome.storage.local.get([FOLLOWED_AUTHORS_KEY], (result) => {
      const existing: Record<string, FollowedAuthor> =
        result[FOLLOWED_AUTHORS_KEY] && typeof result[FOLLOWED_AUTHORS_KEY] === "object"
          ? (result[FOLLOWED_AUTHORS_KEY] as Record<string, FollowedAuthor>)
          : {};
      resolve(Boolean(existing[authorKey(author, source)]));
    });
  });
}

export async function getFollowedAuthors(): Promise<FollowedAuthor[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([FOLLOWED_AUTHORS_KEY], (result) => {
      const existing = (result[FOLLOWED_AUTHORS_KEY] || {}) as Record<string, FollowedAuthor>;
      resolve(Object.values(existing));
    });
  });
}
