/**
 * Layer 3 detector: Chrome built-in Gemini Nano via Prompt API.
 *
 * Runs the model fully on-device. No data leaves the user's machine.
 * Available in Chrome 138+ when the user has downloaded the model
 * (~22 GB). Feature-detected with graceful no-op fallback.
 *
 * Used as a second-pass judgment for borderline cases the regex/stats
 * layers can't decide on (score in the 30-70 range).
 */

interface LanguageModelAvailabilityResult {
  available: boolean;
  status: "available" | "downloadable" | "downloading" | "unavailable" | "unknown";
}

interface LanguageModelSession {
  prompt: (input: string) => Promise<string>;
  destroy?: () => void;
}

interface LanguageModelStatic {
  availability: () => Promise<"available" | "downloadable" | "downloading" | "unavailable">;
  create: (options?: {
    initialPrompts?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    temperature?: number;
    topK?: number;
    expectedInputs?: Array<{ type: "text"; languages?: string[] }>;
    expectedOutputs?: Array<{ type: "text"; languages?: string[] }>;
  }) => Promise<LanguageModelSession>;
  params?: () => Promise<{ defaultTopK: number; defaultTemperature: number; maxTemperature: number }>;
}

declare global {
  interface Window {
    LanguageModel?: LanguageModelStatic;
  }
  // Some Chrome versions expose it on globalThis as well.
  // eslint-disable-next-line no-var
  var LanguageModel: LanguageModelStatic | undefined;
}

let cachedAvailability: LanguageModelAvailabilityResult | null = null;
let cachedSession: LanguageModelSession | null = null;
let creatingSession: Promise<LanguageModelSession | null> | null = null;

function getLanguageModel(): LanguageModelStatic | undefined {
  if (typeof self !== "undefined" && (self as { LanguageModel?: LanguageModelStatic }).LanguageModel) {
    return (self as { LanguageModel?: LanguageModelStatic }).LanguageModel;
  }
  if (typeof window !== "undefined" && window.LanguageModel) {
    return window.LanguageModel;
  }
  return undefined;
}

export async function checkLocalLLMAvailability(): Promise<LanguageModelAvailabilityResult> {
  if (cachedAvailability) return cachedAvailability;

  const lm = getLanguageModel();
  if (!lm) {
    cachedAvailability = { available: false, status: "unavailable" };
    return cachedAvailability;
  }

  try {
    const status = await lm.availability();
    cachedAvailability = {
      available: status === "available",
      status,
    };
    return cachedAvailability;
  } catch {
    cachedAvailability = { available: false, status: "unknown" };
    return cachedAvailability;
  }
}

const SYSTEM_PROMPT = `You are an AI text detector. Given a LinkedIn post or comment, judge how likely it was written by an AI assistant (ChatGPT, Claude, Gemini) versus a human.

Score it 0-100:
- 0-25: clearly human (specific names, numbers, lived detail, idiosyncratic voice)
- 26-49: probably human, some AI assistance possible
- 50-74: likely AI-assisted or AI-written with light editing
- 75-100: almost certainly AI-generated (template structure, vague hedging, no specifics)

Look for: negative parallelism ("It's not X. It's Y."), triple negation, fragment reveals ("The fix? Simple."), invented capitalized concepts ("The Trust Gap"), uniform sentence rhythm, excessive em-dashes, hedging ("It's worth noting"), "serves as" dodge, vague attribution ("studies show"), one-point dilution.

Reply ONLY with valid JSON, no other text:
{"score": <0-100>, "reason": "<one short sentence, max 12 words>"}`;

async function getSession(): Promise<LanguageModelSession | null> {
  if (cachedSession) return cachedSession;
  if (creatingSession) return creatingSession;

  const availability = await checkLocalLLMAvailability();
  if (!availability.available) return null;

  const lm = getLanguageModel();
  if (!lm) return null;

  creatingSession = (async () => {
    try {
      const session = await lm.create({
        initialPrompts: [{ role: "system", content: SYSTEM_PROMPT }],
        temperature: 0.2,
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
      });
      cachedSession = session;
      return session;
    } catch {
      return null;
    } finally {
      creatingSession = null;
    }
  })();

  return creatingSession;
}

export interface LocalLLMResult {
  score: number;
  reason: string;
  available: true;
}

export interface LocalLLMUnavailable {
  available: false;
  status: LanguageModelAvailabilityResult["status"];
}

export type LocalLLMOutcome = LocalLLMResult | LocalLLMUnavailable;

const PROMPT_PREFIX = "Classify this LinkedIn text:\n\n";

export async function judgeWithLocalLLM(text: string): Promise<LocalLLMOutcome> {
  const availability = await checkLocalLLMAvailability();
  if (!availability.available) {
    return { available: false, status: availability.status };
  }

  const session = await getSession();
  if (!session) {
    return { available: false, status: "unavailable" };
  }

  const sample = text.slice(0, 2000);

  try {
    const raw = await session.prompt(PROMPT_PREFIX + sample);
    const parsed = parseJsonResponse(raw);
    if (parsed) return { ...parsed, available: true };
    return { available: false, status: "unknown" };
  } catch {
    return { available: false, status: "unknown" };
  }
}

function parseJsonResponse(raw: string): { score: number; reason: string } | null {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as { score?: number; reason?: string };
    if (typeof obj.score !== "number") return null;
    const score = Math.max(0, Math.min(100, Math.round(obj.score)));
    const reason = typeof obj.reason === "string" ? obj.reason.slice(0, 120) : "Local model judgment";
    return { score, reason };
  } catch {
    return null;
  }
}

export function destroyLocalLLMSession(): void {
  if (cachedSession?.destroy) {
    try {
      cachedSession.destroy();
    } catch {
      // Ignore disposal failures; the next session creation will recover.
    }
  }
  cachedSession = null;
  cachedAvailability = null;
}
