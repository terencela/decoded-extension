import {
  ARCHETYPE_COLORS,
  ARCHETYPE_EMOJIS,
  UPGRADE_URL,
  getArchetypeLabel,
  getScoreColor,
  getConfidenceBand,
  type Settings,
  type DetectionSource,
} from "../shared/constants";
import {
  type ClassificationResult,
  type PatternMatch,
  classifyComment,
  applyLocalLLMJudgment,
} from "./classifier";
import { translatePost, sendFlagFeedback } from "./api";
import {
  getDailyUsage,
  flagTranslation,
  hashText,
  addToHistory,
  getAuthorScore,
} from "./storage";
import { generateShareCard, downloadShareCard, copyShareCardToClipboard } from "./shareCard";
import { judgeWithLocalLLM, checkLocalLLMAvailability } from "./aiDetector";

const SOURCE_LABELS: Record<DetectionSource, string> = {
  regex: "regex",
  stats: "stats",
  "local-llm": "local AI",
  "remote-api": "cloud AI",
};

interface PlatformSelectors {
  actionBar: string[];
  authorHeader: string[];
}

let platformSelectors: PlatformSelectors = {
  actionBar: [
    ".feed-shared-social-action-bar",
    ".social-actions-bar",
    ".feed-shared-update-v2__social-actions",
    ".social-detail-social-actions",
    ".social-action-bar",
    '[data-test-id="social-actions"]',
  ],
  authorHeader: [
    ".update-components-actor",
    ".feed-shared-actor",
    ".feed-shared-update-v2__actor",
  ],
};

export function configurePlatformSelectors(next: PlatformSelectors): void {
  platformSelectors = next;
}

export function extractAuthor(postEl: Element): { name: string; handle?: string } | null {
  const nameSelectors = [
    ".update-components-actor__title span[aria-hidden='true']",
    ".update-components-actor__title",
    ".feed-shared-actor__name span[aria-hidden='true']",
    ".feed-shared-actor__name",
    ".update-components-actor__name",
  ];
  let name = "";
  for (const sel of nameSelectors) {
    const el = postEl.querySelector(sel);
    if (el?.textContent?.trim()) {
      name = el.textContent.trim().split("\n")[0].trim();
      if (name.length >= 2) break;
    }
  }
  if (!name) return null;

  const linkSelectors = [
    ".update-components-actor__container a[href*='/in/']",
    ".update-components-actor__container a[href*='/company/']",
    ".feed-shared-actor a[href*='/in/']",
    ".feed-shared-actor a[href*='/company/']",
  ];
  let handle: string | undefined;
  for (const sel of linkSelectors) {
    const a = postEl.querySelector(sel) as HTMLAnchorElement | null;
    if (a?.href) {
      const m = a.href.match(/\/(in|company)\/([^/?#]+)/);
      if (m?.[2]) {
        handle = m[2];
        break;
      }
    }
  }
  return { name, handle };
}

export function extractPostText(postEl: Element): string {
  const selectors = [
    ".feed-shared-update-v2__description .break-words",
    ".update-components-text .break-words",
    ".feed-shared-text .break-words",
    ".feed-shared-inline-show-more-text",
    ".update-components-text",
    ".feed-shared-text",
  ];

  for (const sel of selectors) {
    const el = postEl.querySelector(sel);
    if (el?.textContent?.trim()) {
      return el.textContent.trim();
    }
  }

  const textEl = postEl.querySelector('[data-test-id="main-feed-activity-card__commentary"]');
  if (textEl?.textContent?.trim()) return textEl.textContent.trim();

  return "";
}

function getActionBar(postEl: Element): Element | null {
  for (const sel of platformSelectors.actionBar) {
    const el = postEl.querySelector(sel);
    if (el) return el;
  }
  return null;
}

export function collapseEngagementFarming(postEl: Element): void {
  if (postEl.querySelector(".decoded-collapse-banner")) return;

  const contentSelectors = [
    ".feed-shared-update-v2__description",
    ".update-components-text",
    ".feed-shared-text",
    ".feed-shared-inline-show-more-text",
  ];

  for (const sel of contentSelectors) {
    const content = postEl.querySelector(sel);
    if (content instanceof HTMLElement) {
      content.style.display = "none";

      const banner = document.createElement("div");
      banner.className = "decoded-collapse-banner";
      banner.innerHTML = `
        <span class="decoded-collapse-icon">${ARCHETYPE_EMOJIS["engagement-farming"]}</span>
        <span class="decoded-collapse-text">Engagement bait detected.</span>
        <button class="decoded-show-anyway" type="button">Show anyway</button>
      `;
      banner.querySelector(".decoded-show-anyway")!.addEventListener("click", () => {
        content.style.display = "";
        banner.remove();
      });
      content.parentNode?.insertBefore(banner, content);
      break;
    }
  }
}

export function injectAIScoreBadge(
  postEl: Element,
  result: ClassificationResult,
  inline = false
): void {
  if (postEl.querySelector(".decoded-score-badge")) return;

  const score = result.aiScore;
  const color = getScoreColor(score);
  const band = getConfidenceBand(score);
  const label = `${band.short} · ${score}%`;

  const badge = document.createElement("div");
  badge.className = inline ? "decoded-score-badge decoded-inline" : "decoded-score-badge";
  badge.setAttribute("data-score", String(score));
  badge.setAttribute("data-band", band.band);
  badge.style.cssText = `background:${color}22;border:1px solid ${color}55;`;
  const signals = result.aiSignals.length > 0 ? result.aiSignals : result.detectedPatterns;
  const sourceChips = result.detectionSources
    .map((src) => `<span class="decoded-src-chip">${escapeHtml(SOURCE_LABELS[src])}</span>`)
    .join("");
  badge.innerHTML = `
    <span class="decoded-score-dot" style="background:${color}"></span>
    <span class="decoded-score-label">${escapeHtml(label)}</span>
    <div class="decoded-score-tooltip">
      <strong>${escapeHtml(band.label)} · ${score}%</strong>
      <div class="decoded-src-chips">${sourceChips}</div>
      ${signals.map((p) => `<div>• ${escapeHtml(p)}</div>`).join("")}
    </div>
  `;

  const header = postEl.querySelector(
    ".update-components-actor, .feed-shared-actor, .feed-shared-update-v2__actor"
  );
  if (header) {
    header.appendChild(badge);
  }
}

function refreshAIScoreBadge(postEl: Element, result: ClassificationResult): void {
  const existing = postEl.querySelector(".decoded-score-badge");
  if (!existing) return;
  const wasInline = existing.classList.contains("decoded-inline");
  existing.remove();
  injectAIScoreBadge(postEl, result, wasInline);
}

export async function injectAuthorTrustBadge(
  postEl: Element,
  authorName: string,
  source: "linkedin" | "twitter",
  inline = false,
): Promise<void> {
  if (postEl.querySelector(".decoded-trust-badge")) return;
  const score = await getAuthorScore(authorName, source);
  if (!score || score.postCount < 3) return;
  const avg = Math.round(score.totalAIScore / score.postCount);
  if (avg < 50) return;

  const color = getScoreColor(avg);
  const dominant = Object.entries(score.archetypeCounts).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
  const dominantLabel = dominant ? dominant[0] : "";

  const badge = document.createElement("div");
  badge.className = inline ? "decoded-trust-badge decoded-inline" : "decoded-trust-badge";
  badge.style.cssText = `background:${color}18;border:1px solid ${color}44;color:${color};`;
  badge.innerHTML = `
    <span class="decoded-trust-icon" aria-hidden="true">📊</span>
    <span class="decoded-trust-text">avg ${avg}% AI · ${score.postCount} posts</span>
    <div class="decoded-score-tooltip">
      <strong>Author trust — ${escapeHtml(authorName)}</strong>
      <div>Average AI score: ${avg}% across ${score.postCount} posts</div>
      ${dominantLabel ? `<div>Most common: ${escapeHtml(dominantLabel)}</div>` : ""}
      <div style="opacity:0.6;margin-top:4px;font-size:10px">Tracked locally on your device only.</div>
    </div>
  `;

  const header = platformSelectors.authorHeader
    .map((sel) => postEl.querySelector(sel))
    .find((el): el is Element => Boolean(el));
  if (header) header.appendChild(badge);
}

export async function recordHistory(args: {
  text: string;
  translation: string;
  result: ClassificationResult;
  source: "linkedin" | "twitter";
  author?: string;
  authorHandle?: string;
}): Promise<void> {
  const excerpt = args.text.replace(/\s+/g, " ").trim().slice(0, 220);
  await addToHistory({
    hash: hashText(args.text),
    excerpt,
    translation: args.translation,
    archetype: args.result.archetype,
    aiScore: args.result.aiScore,
    source: args.source,
    author: args.author,
    authorHandle: args.authorHandle,
  });
}

export function injectArchetypeBadge(
  postEl: Element,
  result: ClassificationResult,
  inline = false
): void {
  if (postEl.querySelector(".decoded-archetype-pill")) return;

  const archetype = result.archetype;
  const color = ARCHETYPE_COLORS[archetype];
  const emoji = ARCHETYPE_EMOJIS[archetype];
  const label = getArchetypeLabel(archetype);

  const pill = document.createElement("div");
  pill.className = inline ? "decoded-archetype-pill decoded-inline" : "decoded-archetype-pill";
  pill.style.cssText = `background:${color}15;border:1px solid ${color}40;`;
  pill.innerHTML = `<span>${emoji}</span><span class="decoded-pill-label" style="color:${color}">${escapeHtml(label)}</span>`;

  const actionBar = getActionBar(postEl);
  if (actionBar) {
    actionBar.parentNode?.insertBefore(pill, actionBar);
  }
}

export function injectDecodeButton(
  postEl: Element,
  result: ClassificationResult,
  postText: string,
  inline = false,
  context?: DecodeContext,
): void {
  if (postEl.querySelector(".decoded-decode-btn")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = inline ? "decoded-decode-btn decoded-inline" : "decoded-decode-btn";
  btn.title = "Decode this post (Ctrl+Shift+D)";
  btn.setAttribute("aria-label", "Decode this post");
  btn.innerHTML = `<span class="decoded-btn-icon" aria-hidden="true">🔍</span><span class="decoded-btn-text">Decode</span>`;

  btn.addEventListener("click", () => runDecode(postEl, result, postText, btn, context));

  const actionBar = getActionBar(postEl);
  if (actionBar) {
    const wrapper = document.createElement("div");
    wrapper.className = inline ? "decoded-btn-wrapper decoded-inline" : "decoded-btn-wrapper";
    wrapper.appendChild(btn);
    actionBar.appendChild(wrapper);
  }
}

export interface DecodeContext {
  source: "linkedin" | "twitter";
  author?: string;
  authorHandle?: string;
}

export async function runDecode(
  postEl: Element,
  result: ClassificationResult,
  postText: string,
  btn?: HTMLButtonElement | null,
  context?: DecodeContext,
): Promise<void> {
  const button = btn ?? (postEl.querySelector(".decoded-decode-btn") as HTMLButtonElement | null);
  const setIdle = () => {
    if (button) {
      button.innerHTML = `<span class="decoded-btn-icon" aria-hidden="true">🔍</span><span class="decoded-btn-text">Decode</span>`;
      button.disabled = false;
    }
  };
  const setLoading = (label = "Decoding…") => {
    if (button) {
      button.innerHTML = `<span class="decoded-btn-icon" aria-hidden="true">⏳</span><span class="decoded-btn-text">${escapeHtml(label)}</span>`;
      button.disabled = true;
    }
  };
  const setOpen = () => {
    if (button) {
      button.innerHTML = `<span class="decoded-btn-icon" aria-hidden="true">✕</span><span class="decoded-btn-text">Close</span>`;
      button.disabled = false;
    }
  };

  const existingOverlay = postEl.querySelector(".decoded-overlay");
  if (existingOverlay) {
    existingOverlay.remove();
    setIdle();
    return;
  }

  setLoading();

  let workingResult = result;
  if (result.needsApiConfirmation) {
    const availability = await checkLocalLLMAvailability();
    if (availability.available) {
      setLoading("Local AI…");
      const llm = await judgeWithLocalLLM(postText);
      if (llm.available) {
        workingResult = applyLocalLLMJudgment(workingResult, llm.score, llm.reason);
        refreshAIScoreBadge(postEl, workingResult);
      }
    }
  }

  setLoading();
  const translateResult = await translatePost(
    postText,
    workingResult.archetype,
    workingResult.detectedPatterns,
    workingResult.aiScore,
    workingResult.needsApiConfirmation
  );

  if (!translateResult.ok) {
    showError(postEl, translateResult.error.message);
    setIdle();
    return;
  }

  showTranslationOverlay(postEl, translateResult.data.translation, workingResult, postText);
  setOpen();
  updateUsageDisplay();

  void recordHistory({
    text: postText,
    translation: translateResult.data.translation,
    result: workingResult,
    source: context?.source ?? "linkedin",
    author: context?.author,
    authorHandle: context?.authorHandle,
  });
}

async function updateUsageDisplay(): Promise<void> {
  const usage = await getDailyUsage();
  chrome.runtime.sendMessage({ type: "USAGE_UPDATED", count: usage.count });
}

function showError(postEl: Element, message: string): void {
  const existing = postEl.querySelector(".decoded-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.className = "decoded-overlay decoded-overlay--error";
  const showUpgrade = message.includes("upgrade") || message.includes("free decode");
  overlay.innerHTML = `
    <div class="decoded-overlay-inner">
      <div class="decoded-error-msg">${escapeHtml(message)}</div>
      ${showUpgrade ? `<a href="${UPGRADE_URL}" target="_blank" rel="noopener" class="decoded-upgrade-link">Upgrade to Pro — $3/mo</a>` : ""}
      <button class="decoded-overlay-close" type="button" aria-label="Close">✕ Close</button>
    </div>
  `;
  overlay.querySelector(".decoded-overlay-close")!.addEventListener("click", () => overlay.remove());

  const actionBar = getActionBar(postEl);
  actionBar?.parentNode?.insertBefore(overlay, actionBar);
}

function buildHighlightedText(text: string, matches: PatternMatch[], maxLen = 600): string {
  const truncated = text.length > maxLen ? text.slice(0, maxLen).trimEnd() + "…" : text;
  if (matches.length === 0) return escapeHtml(truncated);

  const inRange = matches
    .filter((m) => m.index >= 0 && m.index < truncated.length)
    .sort((a, b) => a.index - b.index);

  let html = "";
  let cursor = 0;
  for (const match of inRange) {
    const end = Math.min(match.index + match.text.length, truncated.length);
    if (match.index < cursor) continue;
    html += escapeHtml(truncated.slice(cursor, match.index));
    const slice = truncated.slice(match.index, end);
    html += `<mark class="decoded-mark" data-label="${escapeHtml(match.label)}" title="${escapeHtml(match.label)}">${escapeHtml(slice)}</mark>`;
    cursor = end;
  }
  html += escapeHtml(truncated.slice(cursor));
  return html;
}

function showTranslationOverlay(
  postEl: Element,
  translation: string,
  result: ClassificationResult,
  originalText: string
): void {
  const existing = postEl.querySelector(".decoded-overlay");
  if (existing) existing.remove();

  const archetype = result.archetype;
  const color = ARCHETYPE_COLORS[archetype];
  const emoji = ARCHETYPE_EMOJIS[archetype];
  const label = getArchetypeLabel(archetype);
  const aiScore = result.aiScore;
  const scoreColor = getScoreColor(aiScore);
  const band = getConfidenceBand(aiScore);

  const overlay = document.createElement("div");
  overlay.className = "decoded-overlay";
  overlay.style.setProperty("--decoded-accent", color);

  const highlightedOriginal = buildHighlightedText(originalText, result.matches);
  const sourceChips = result.detectionSources
    .map((src) => `<span class="decoded-src-chip">${escapeHtml(SOURCE_LABELS[src])}</span>`)
    .join("");

  const aiSignalsRows = result.aiSignals.length > 0
    ? `<div class="decoded-ai-signals">
         ${result.aiSignals.slice(0, 5).map((s) => `<div class="decoded-ai-signal">• ${escapeHtml(s)}</div>`).join("")}
       </div>`
    : "";

  overlay.innerHTML = `
    <div class="decoded-overlay-inner">
      <div class="decoded-overlay-header">
        <div class="decoded-overlay-badges">
          <span class="decoded-badge" style="background:${color}20;border:1px solid ${color}50;color:${color}">
            ${emoji} ${escapeHtml(label)}
          </span>
          <span class="decoded-badge decoded-ai-badge" style="background:${scoreColor}20;border:1px solid ${scoreColor}50;color:${scoreColor}">
            🤖 ${escapeHtml(band.label)} · ${aiScore}%
          </span>
        </div>
        <button class="decoded-overlay-close" type="button" title="Close" aria-label="Close">✕</button>
      </div>

      <div class="decoded-source-row">
        <span class="decoded-source-label">Detected by</span>
        <div class="decoded-src-chips">${sourceChips}</div>
        ${result.llmReason ? `<span class="decoded-llm-reason" title="On-device Gemini Nano">${escapeHtml(result.llmReason)}</span>` : ""}
      </div>

      <div class="decoded-translation-block">
        <div class="decoded-translation-label">What this post is actually doing</div>
        <div class="decoded-translation-text">${escapeHtml(translation)}</div>
      </div>

      ${result.matches.length > 0 ? `
        <div class="decoded-highlight-block">
          <div class="decoded-translation-label">Highlighted phrases (hover for tag)</div>
          <div class="decoded-highlight-text">${highlightedOriginal}</div>
        </div>
      ` : ""}

      ${aiSignalsRows ? `
        <div class="decoded-patterns">
          <div class="decoded-patterns-label">AI tells</div>
          ${aiSignalsRows}
        </div>
      ` : ""}

      ${result.detectedPatterns.length > 0 ? `
        <div class="decoded-patterns">
          <div class="decoded-patterns-label">Archetype patterns</div>
          <div class="decoded-patterns-list">
            ${result.detectedPatterns.map((p) => `<span class="decoded-pattern-tag">${escapeHtml(p)}</span>`).join("")}
          </div>
        </div>
      ` : ""}

      <div class="decoded-overlay-actions">
        <button class="decoded-share-btn" type="button" data-action="share">📤 Share card</button>
        <button class="decoded-copy-btn" type="button" data-action="copy">📋 Copy image</button>
        <button class="decoded-flag-btn" type="button" data-action="flag">🚩 Flag translation</button>
      </div>

      <div class="decoded-share-note" hidden></div>
    </div>
  `;

  overlay.querySelector(".decoded-overlay-close")!.addEventListener("click", () => {
    overlay.remove();
    const btn = postEl.querySelector(".decoded-decode-btn") as HTMLButtonElement | null;
    if (btn) {
      btn.innerHTML = `<span class="decoded-btn-icon" aria-hidden="true">🔍</span><span class="decoded-btn-text">Decode</span>`;
      btn.disabled = false;
    }
  });

  const shareNote = overlay.querySelector(".decoded-share-note") as HTMLElement;
  const flashNote = (msg: string, ms = 3000) => {
    shareNote.hidden = false;
    shareNote.textContent = msg;
    window.setTimeout(() => {
      shareNote.hidden = true;
    }, ms);
  };

  overlay.querySelector('[data-action="share"]')!.addEventListener("click", async () => {
    flashNote("Generating share card…", 8000);
    try {
      const blob = await generateShareCard(originalText.slice(0, 280), translation, archetype, aiScore);
      await downloadShareCard(blob);
      flashNote("Share card downloaded.");
    } catch {
      flashNote("Failed to generate card.");
    }
  });

  overlay.querySelector('[data-action="copy"]')!.addEventListener("click", async () => {
    flashNote("Copying to clipboard…", 8000);
    try {
      const blob = await generateShareCard(originalText.slice(0, 280), translation, archetype, aiScore);
      const success = await copyShareCardToClipboard(blob);
      flashNote(success ? "Copied. Paste into X or Stories." : "Could not copy. Try Download instead.");
    } catch {
      flashNote("Failed to copy.");
    }
  });

  overlay.querySelector('[data-action="flag"]')!.addEventListener("click", async () => {
    const flagBtn = overlay.querySelector('[data-action="flag"]') as HTMLButtonElement;
    flagBtn.disabled = true;
    const hash = hashText(originalText);
    await flagTranslation({ hash, text: originalText.slice(0, 500), translation, archetype });
    void sendFlagFeedback({ hash, archetype });
    flashNote("Thanks. Stored locally and synced when API is reachable.");
  });

  const actionBar = getActionBar(postEl);
  if (actionBar) {
    actionBar.parentNode?.insertBefore(overlay, actionBar);
  } else {
    postEl.appendChild(overlay);
  }
}

export function injectCommentLabels(
  postEl: Element,
  settings: Pick<Settings, "showCommentLabels">
): void {
  if (!settings.showCommentLabels) return;

  const commentSelectors = [
    ".comments-comment-item__main-content",
    ".comments-comment-texteditor__content",
    ".feed-shared-main-content--comment .break-words",
  ];

  for (const sel of commentSelectors) {
    const comments = postEl.querySelectorAll(sel);
    comments.forEach((commentEl) => {
      if (commentEl.querySelector(".decoded-comment-label")) return;
      const text = commentEl.textContent?.trim() || "";
      if (text.length < 30) return;

      const result = classifyComment(text);
      if (!result.isAIGenerated) return;

      const archetypeEmoji = ARCHETYPE_EMOJIS[result.archetype];
      const label = document.createElement("div");
      label.className = "decoded-comment-label";
      label.innerHTML = `
        <span class="decoded-comment-icon" aria-hidden="true">🤖</span>
        <span class="decoded-comment-text">
          <strong>${archetypeEmoji} ${escapeHtml(result.archetypeLabel)}</strong> · AI comment (${result.confidence}%)
          ${result.patterns.length > 0 ? `<span class="decoded-comment-patterns">${escapeHtml(result.patterns.slice(0, 2).join(", "))}</span>` : ""}
        </span>
      `;
      commentEl.appendChild(label);
    });
  }
}

export function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/`/g, "&#96;")
    .replace(/\//g, "&#47;");
}
