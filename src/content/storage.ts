export interface Settings {
  enabled: boolean;
  showAIScore: boolean;
  autoCollapseEngagementBait: boolean;
  showCommentLabels: boolean;
  showArchetypeLabels: boolean;
  apiUrl: string;
}

export interface DailyUsage {
  count: number;
  date: string;
}

const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  showAIScore: true,
  autoCollapseEngagementBait: true,
  showCommentLabels: true,
  showArchetypeLabels: true,
  apiUrl: "https://decoded-api.replit.app/api",
};

export const FREE_DAILY_LIMIT = 5;

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

export async function getCachedResult(postHash: string): Promise<{ translation: string; archetype: string } | null> {
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
