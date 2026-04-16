import { type ClassificationResult, type Archetype, getArchetypeLabel, classifyComment } from "./classifier";
import { translatePost } from "./api";
import { getDailyUsage, FREE_DAILY_LIMIT } from "./storage";
import { generateShareCard, downloadShareCard, copyShareCardToClipboard } from "./shareCard";

const ARCHETYPE_COLORS: Record<Archetype, string> = {
  "failure-laundering": "#ef4444",
  "engagement-farming": "#f97316",
  "status-packaging": "#a855f7",
  "ai-sludge": "#3b82f6",
  "consensus-wisdom": "#6b7280",
};

const ARCHETYPE_EMOJIS: Record<Archetype, string> = {
  "failure-laundering": "🪣",
  "engagement-farming": "🎣",
  "status-packaging": "📦",
  "ai-sludge": "🤖",
  "consensus-wisdom": "🧘",
};

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
  const selectors = [
    ".feed-shared-social-action-bar",
    ".social-actions-bar",
    ".feed-shared-update-v2__social-actions",
    ".social-action-bar",
    '[data-test-id="social-actions"]',
  ];
  for (const sel of selectors) {
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
        <span class="decoded-collapse-icon">🎣</span>
        <span class="decoded-collapse-text">Engagement bait detected.</span>
        <button class="decoded-show-anyway">Show anyway</button>
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

export function injectAIScoreBadge(postEl: Element, result: ClassificationResult): void {
  if (postEl.querySelector(".decoded-score-badge")) return;

  const score = result.aiScore;
  const color = score > 70 ? "#ef4444" : score > 35 ? "#f97316" : "#22c55e";
  const label = `${score}% AI`;

  const badge = document.createElement("div");
  badge.className = "decoded-score-badge";
  badge.setAttribute("data-score", String(score));
  badge.style.cssText = `background:${color}22;border:1px solid ${color}55;`;
  const signals = result.aiSignals.length > 0 ? result.aiSignals : result.detectedPatterns;
  badge.innerHTML = `
    <span class="decoded-score-dot" style="background:${color}"></span>
    <span class="decoded-score-label">${label}</span>
    <div class="decoded-score-tooltip">
      <strong>AI Score: ${score}%</strong>
      ${signals.map((p) => `<div>• ${p}</div>`).join("")}
    </div>
  `;

  const header = postEl.querySelector(
    ".update-components-actor, .feed-shared-actor, .feed-shared-update-v2__actor"
  );
  if (header) {
    header.appendChild(badge);
  }
}

export function injectArchetypeBadge(postEl: Element, result: ClassificationResult): void {
  if (postEl.querySelector(".decoded-archetype-pill")) return;

  const archetype = result.archetype;
  const color = ARCHETYPE_COLORS[archetype];
  const emoji = ARCHETYPE_EMOJIS[archetype];
  const label = getArchetypeLabel(archetype);

  const pill = document.createElement("div");
  pill.className = "decoded-archetype-pill";
  pill.style.cssText = `background:${color}15;border:1px solid ${color}40;`;
  pill.innerHTML = `<span>${emoji}</span><span class="decoded-pill-label" style="color:${color}">${label}</span>`;

  const actionBar = getActionBar(postEl);
  if (actionBar) {
    actionBar.parentNode?.insertBefore(pill, actionBar);
  }
}

export function injectDecodeButton(
  postEl: Element,
  result: ClassificationResult,
  postText: string
): void {
  if (postEl.querySelector(".decoded-decode-btn")) return;

  const btn = document.createElement("button");
  btn.className = "decoded-decode-btn";
  btn.title = "Decode this post with Decoded";
  btn.innerHTML = `<span class="decoded-btn-icon">🔍</span><span class="decoded-btn-text">Decode</span>`;

  btn.addEventListener("click", async () => {
    btn.innerHTML = `<span class="decoded-btn-icon">⏳</span><span class="decoded-btn-text">Decoding…</span>`;
    btn.disabled = true;

    const existingOverlay = postEl.querySelector(".decoded-overlay");
    if (existingOverlay) {
      existingOverlay.remove();
      btn.innerHTML = `<span class="decoded-btn-icon">🔍</span><span class="decoded-btn-text">Decode</span>`;
      btn.disabled = false;
      return;
    }

    const translateResult = await translatePost(
      postText,
      result.archetype,
      result.detectedPatterns,
      result.aiScore,
      result.needsApiConfirmation
    );

    if (!translateResult.ok) {
      showError(postEl, translateResult.error.message, result);
      btn.innerHTML = `<span class="decoded-btn-icon">🔍</span><span class="decoded-btn-text">Decode</span>`;
      btn.disabled = false;
      return;
    }

    showTranslationOverlay(postEl, translateResult.data.translation, result, postText);
    btn.innerHTML = `<span class="decoded-btn-icon">✕</span><span class="decoded-btn-text">Close</span>`;
    btn.disabled = false;

    updateUsageDisplay();
  });

  const actionBar = getActionBar(postEl);
  if (actionBar) {
    const wrapper = document.createElement("div");
    wrapper.className = "decoded-btn-wrapper";
    wrapper.appendChild(btn);
    actionBar.appendChild(wrapper);
  }
}

async function updateUsageDisplay(): Promise<void> {
  const usage = await getDailyUsage();
  chrome.runtime.sendMessage({ type: "USAGE_UPDATED", count: usage.count });
}

function showError(postEl: Element, message: string, result: ClassificationResult): void {
  const existing = postEl.querySelector(".decoded-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.className = "decoded-overlay decoded-overlay--error";
  overlay.innerHTML = `
    <div class="decoded-overlay-inner">
      <div class="decoded-error-msg">${message}</div>
      ${
        message.includes("upgrade") || message.includes("free decode")
          ? `<a href="https://decoded.app/upgrade" target="_blank" class="decoded-upgrade-link">Upgrade to Pro — $3/mo</a>`
          : ""
      }
      <button class="decoded-overlay-close">✕ Close</button>
    </div>
  `;
  overlay.querySelector(".decoded-overlay-close")!.addEventListener("click", () => overlay.remove());

  const actionBar = getActionBar(postEl);
  actionBar?.parentNode?.insertBefore(overlay, actionBar);
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
  const scoreColor = aiScore > 70 ? "#ef4444" : aiScore > 35 ? "#f97316" : "#22c55e";

  const overlay = document.createElement("div");
  overlay.className = "decoded-overlay";
  overlay.style.setProperty("--decoded-accent", color);

  overlay.innerHTML = `
    <div class="decoded-overlay-inner">
      <div class="decoded-overlay-header">
        <div class="decoded-overlay-badges">
          <span class="decoded-badge" style="background:${color}20;border:1px solid ${color}50;color:${color}">
            ${emoji} ${label}
          </span>
          <span class="decoded-badge decoded-ai-badge" style="background:${scoreColor}20;border:1px solid ${scoreColor}50;color:${scoreColor}">
            🤖 ${aiScore}% AI
          </span>
        </div>
        <button class="decoded-overlay-close" title="Close">✕</button>
      </div>

      <div class="decoded-translation-block">
        <div class="decoded-translation-label">What this post is actually doing</div>
        <div class="decoded-translation-text">${escapeHtml(translation)}</div>
      </div>

      ${
        result.detectedPatterns.length > 0
          ? `<div class="decoded-patterns">
          <div class="decoded-patterns-label">Detected patterns</div>
          <div class="decoded-patterns-list">
            ${result.detectedPatterns.map((p) => `<span class="decoded-pattern-tag">${escapeHtml(p)}</span>`).join("")}
          </div>
        </div>`
          : ""
      }

      <div class="decoded-overlay-actions">
        <button class="decoded-share-btn" data-action="share">📤 Share card</button>
        <button class="decoded-copy-btn" data-action="copy">📋 Copy image</button>
        <button class="decoded-flag-btn" data-action="flag">🚩 Flag translation</button>
      </div>

      <div class="decoded-share-note" style="display:none">
        Generating 1200×630 share card…
      </div>
    </div>
  `;

  overlay.querySelector(".decoded-overlay-close")!.addEventListener("click", () => {
    overlay.remove();
    const btn = postEl.querySelector(".decoded-decode-btn") as HTMLButtonElement | null;
    if (btn) {
      btn.innerHTML = `<span class="decoded-btn-icon">🔍</span><span class="decoded-btn-text">Decode</span>`;
      btn.disabled = false;
    }
  });

  const shareNote = overlay.querySelector(".decoded-share-note") as HTMLElement;

  overlay.querySelector('[data-action="share"]')!.addEventListener("click", async () => {
    shareNote.style.display = "block";
    shareNote.textContent = "Generating share card…";
    try {
      const blob = await generateShareCard(
        originalText.slice(0, 280),
        translation,
        archetype,
        aiScore
      );
      await downloadShareCard(blob);
      shareNote.textContent = "Share card downloaded! 🎉";
    } catch {
      shareNote.textContent = "Failed to generate card.";
    }
    setTimeout(() => (shareNote.style.display = "none"), 3000);
  });

  overlay.querySelector('[data-action="copy"]')!.addEventListener("click", async () => {
    shareNote.style.display = "block";
    shareNote.textContent = "Copying to clipboard…";
    try {
      const blob = await generateShareCard(
        originalText.slice(0, 280),
        translation,
        archetype,
        aiScore
      );
      const success = await copyShareCardToClipboard(blob);
      shareNote.textContent = success ? "Copied! Paste into X or Stories 🎉" : "Could not copy. Try Download instead.";
    } catch {
      shareNote.textContent = "Failed to copy.";
    }
    setTimeout(() => (shareNote.style.display = "none"), 3000);
  });

  overlay.querySelector('[data-action="flag"]')!.addEventListener("click", () => {
    shareNote.style.display = "block";
    shareNote.textContent = "Thanks for flagging. We'll review this translation.";
    setTimeout(() => (shareNote.style.display = "none"), 3000);
  });

  const actionBar = getActionBar(postEl);
  if (actionBar) {
    actionBar.parentNode?.insertBefore(overlay, actionBar);
  } else {
    postEl.appendChild(overlay);
  }
}

export function injectCommentLabels(postEl: Element, settings: { showCommentLabels: boolean }): void {
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
        <span class="decoded-comment-icon">🤖</span>
        <span class="decoded-comment-text">
          <strong>${archetypeEmoji} ${result.archetypeLabel}</strong> • AI comment (${result.confidence}%)
          ${result.patterns.length > 0 ? `<span class="decoded-comment-patterns">${result.patterns.slice(0, 2).join(", ")}</span>` : ""}
        </span>
      `;
      commentEl.appendChild(label);
    });
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
