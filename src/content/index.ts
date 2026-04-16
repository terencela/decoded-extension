import { classifyPost } from "./classifier";
import { getSettings } from "./storage";
import {
  extractPostText,
  collapseEngagementFarming,
  injectAIScoreBadge,
  injectArchetypeBadge,
  injectDecodeButton,
  injectCommentLabels,
} from "./injector";

let processedPosts = new WeakSet<Element>();

const POST_SELECTORS = [
  ".feed-shared-update-v2",
  ".occludable-update",
  '[data-id*="urn:li:activity"]',
  '[data-urn*="urn:li:activity"]',
];

function findAllPosts(root: Element | Document = document): Element[] {
  const found = new Set<Element>();
  for (const sel of POST_SELECTORS) {
    root.querySelectorAll(sel).forEach((el) => found.add(el));
  }
  return Array.from(found);
}

async function processPost(postEl: Element): Promise<void> {
  if (processedPosts.has(postEl)) return;

  const text = extractPostText(postEl);
  if (!text || text.length < 40) return;

  processedPosts.add(postEl);

  const settings = await getSettings();
  if (!settings.enabled) return;

  const result = classifyPost(text, postEl);

  if (settings.autoCollapseEngagementBait && result.isHardEngagementFarming) {
    collapseEngagementFarming(postEl);
  }

  if (settings.showAIScore) {
    injectAIScoreBadge(postEl, result);
  }

  if (settings.showArchetypeLabels && result.confidence > 25) {
    injectArchetypeBadge(postEl, result);
  }

  postEl.addEventListener("mouseenter", () => {
    postEl.classList.add("decoded-post-hovered");
    injectDecodeButton(postEl, result, text);
  });

  postEl.addEventListener("mouseleave", () => {
    postEl.classList.remove("decoded-post-hovered");
    if (!postEl.querySelector(".decoded-overlay")) {
      postEl.querySelector(".decoded-btn-wrapper")?.remove();
    }
  });
}

function scanForComments(root: Document | Element = document): void {
  const commentLists = root.querySelectorAll(
    ".comments-comments-list, .feed-shared-update-v2, .comments-comment-list"
  );
  commentLists.forEach((el) => {
    getSettings().then((settings) => {
      injectCommentLabels(el, settings);
    });
  });
}

function initFeedObserver(): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;

        const posts = findAllPosts(node);
        for (const post of posts) {
          processPost(post);
        }

        for (const sel of POST_SELECTORS) {
          if (node.matches(sel)) processPost(node);
        }

        scanForComments(node);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

async function init(): Promise<void> {
  if (!window.location.hostname.includes("linkedin.com")) return;

  const settings = await getSettings();
  if (!settings.enabled) return;

  const posts = findAllPosts();
  await Promise.all(posts.map(processPost));

  scanForComments();
  initFeedObserver();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

chrome.runtime.onMessage.addListener((msg: unknown) => {
  if (typeof msg === "object" && msg !== null && "type" in msg) {
    const m = msg as { type: string };
    if (m.type === "SETTINGS_CHANGED") {
      document.querySelectorAll(".decoded-score-badge, .decoded-archetype-pill, .decoded-decode-btn, .decoded-overlay, .decoded-collapse-banner, .decoded-comment-label, .decoded-btn-wrapper").forEach((el) => el.remove());
      processedPosts = new WeakSet<Element>();
      init();
    }
  }
});
