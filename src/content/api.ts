import { type Archetype } from "../shared/constants";
import { ARCHETYPES, FREE_DAILY_LIMIT } from "../shared/constants";
import {
  getSettings,
  canDecode,
  incrementDailyUsage,
  getCachedResult,
  setCachedResult,
  hashText,
} from "./storage";

export interface TranslateResponse {
  translation: string;
  archetype: Archetype;
  detectedPatterns: string[];
  cached?: boolean;
}

export interface TranslateError {
  error: "rate_limited" | "api_error" | "network_error" | "usage_limit";
  message: string;
}

export type TranslateResult =
  | { ok: true; data: TranslateResponse }
  | { ok: false; error: TranslateError };

async function classifyWithAPI(
  text: string,
  aiScore: number,
  apiUrl: string
): Promise<Archetype | null> {
  try {
    const response = await fetch(`${apiUrl}/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 1500), aiScore }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { archetype: string; confidence: number };
    if (ARCHETYPES.includes(data.archetype as Archetype)) {
      return data.archetype as Archetype;
    }
    return null;
  } catch {
    return null;
  }
}

export async function translatePost(
  text: string,
  archetype: Archetype,
  detectedPatterns: string[],
  aiScore: number,
  needsApiConfirmation: boolean,
  isComment = false
): Promise<TranslateResult> {
  const postHash = hashText(text);
  const cached = await getCachedResult(postHash);
  if (cached) {
    return {
      ok: true,
      data: {
        translation: cached.translation,
        archetype: cached.archetype as Archetype,
        detectedPatterns,
        cached: true,
      },
    };
  }

  const allowed = await canDecode();
  if (!allowed) {
    return {
      ok: false,
      error: {
        error: "usage_limit",
        message: `You've used all ${FREE_DAILY_LIMIT} free decodes for today. Upgrade to Pro for unlimited decodes.`,
      },
    };
  }

  const settings = await getSettings();
  const apiUrl = settings.apiUrl;

  let confirmedArchetype = archetype;
  if (needsApiConfirmation) {
    const apiArchetype = await classifyWithAPI(text, aiScore, apiUrl);
    if (apiArchetype) {
      confirmedArchetype = apiArchetype;
    }
  }

  try {
    const response = await fetch(`${apiUrl}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text.slice(0, 2000),
        archetype: confirmedArchetype,
        detectedPatterns,
        isComment,
      }),
    });

    if (response.status === 429) {
      return {
        ok: false,
        error: { error: "rate_limited", message: "Too many requests. Try again in a moment." },
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        error: { error: "api_error", message: "Translation service unavailable." },
      };
    }

    const data = (await response.json()) as TranslateResponse;

    await incrementDailyUsage();
    await setCachedResult(postHash, { translation: data.translation, archetype: data.archetype });

    return { ok: true, data };
  } catch {
    return {
      ok: false,
      error: { error: "network_error", message: "Could not reach the Decoded API. Check your connection." },
    };
  }
}

export async function sendFlagFeedback(payload: {
  hash: string;
  archetype: Archetype;
  reason?: string;
}): Promise<boolean> {
  try {
    const settings = await getSettings();
    const response = await fetch(`${settings.apiUrl}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch {
    return false;
  }
}
