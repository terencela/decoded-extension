import { type RuntimeMessage, type Settings } from "../shared/constants";
import { classifyPost } from "./classifier";
import { syncAuthorScore } from "./backendSync";
import { getSettings, recordAuthorScore } from "./storage";
import {
  extractAuthor,
  extractPostText,
  collapseEngagementFarming,
  injectAIScoreBadge,
  injectArchetypeBadge,
  injectAuthorTrustBadge,
  injectDecodeButton,
  injectCommentLabels,
  runDecode,
  type DecodeContext,
} from "./injector";

let processedPosts = new WeakSet<Element>();
let hoveredPost: Element | null = null;
const lastResultByPost = new WeakMap<
  Element,
  { result: ReturnType<typeof classifyPost>; text: string; context: DecodeContext }
>();

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

async function processPost(postEl: Element, settings: Settings): Promise<void> {
  if (processedPosts.has(postEl)) return;

  const text = extractPostText(postEl);
  if (!text || text.length < 40) return;

  processedPosts.add(postEl);

  if (!settings.enabled) return;

  const result = classifyPost(text);
  const author = extractAuthor(postEl);
  const context: DecodeContext = {
    source: "linkedin",
    author: author?.name,
    authorHandle: author?.handle,
    settings,
  };
  lastResultByPost.set(postEl, { result, text, context });

  if (author?.name) {
    void recordAuthorScore(author.name, result.archetype, result.aiScore, "linkedin", author.handle).then(
      (score) => {
        if (score) void syncAuthorScore(settings, score);
      },
    );
  }

  if (settings.autoCollapseEngagementBait && result.isHardEngagementFarming) {
    collapseEngagementFarming(postEl);
  }

  const inline = settings.inlineMode;

  if (settings.showAIScore) {
    injectAIScoreBadge(postEl, result, inline);
  }

  if (settings.showArchetypeLabels && result.confidence > 25) {
    injectArchetypeBadge(postEl, result, inline);
  }

  if (author?.name) {
    void injectAuthorTrustBadge(postEl, author.name, "linkedin", inline);
  }

  if (inline) {
    injectDecodeButton(postEl, result, text, true, context);
  } else {
    postEl.addEventListener("mouseenter", () => {
      postEl.classList.add("decoded-post-hovered");
      hoveredPost = postEl;
      injectDecodeButton(postEl, result, text, false, context);
    });

    postEl.addEventListener("mouseleave", () => {
      postEl.classList.remove("decoded-post-hovered");
      if (hoveredPost === postEl) hoveredPost = null;
      if (!postEl.querySelector(".decoded-overlay")) {
        postEl.querySelector(".decoded-btn-wrapper")?.remove();
      }
    });
  }
}

function scanForComments(root: Element | Document, settings: Pick<Settings, "showCommentLabels">): void {
  const commentLists = root.querySelectorAll(
    ".comments-comments-list, .feed-shared-update-v2, .comments-comment-list"
  );
  commentLists.forEach((el) => injectCommentLabels(el, settings));
}

function initFeedObserver(settings: Settings): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;

        const posts = findAllPosts(node);
        for (const post of posts) {
          processPost(post, settings);
        }

        for (const sel of POST_SELECTORS) {
          if (node.matches(sel)) processPost(node, settings);
        }

        scanForComments(node, settings);
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
  await Promise.all(posts.map((post) => processPost(post, settings)));

  scanForComments(document, settings);
  initFeedObserver(settings);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

document.addEventListener(
  "keydown",
  (event) => {
    const isShortcut =
      (event.ctrlKey || event.metaKey) && event.shiftKey && event.code === "KeyD";
    if (!isShortcut) return;

    const postUnderCursor =
      hoveredPost ?? (event.target instanceof Element ? event.target.closest(POST_SELECTORS.join(",")) : null);
    if (!postUnderCursor) return;

    const cached = lastResultByPost.get(postUnderCursor);
    if (!cached) return;

    event.preventDefault();
    runDecode(postUnderCursor, cached.result, cached.text, null, cached.context);
  },
  true
);

chrome.runtime.onMessage.addListener((msg: unknown) => {
  const m = msg as RuntimeMessage;
  if (!m || typeof m !== "object" || !("type" in m)) return;

  if (m.type === "SETTINGS_CHANGED") {
    document
      .querySelectorAll(
        ".decoded-score-badge, .decoded-archetype-pill, .decoded-decode-btn, .decoded-overlay, .decoded-collapse-banner, .decoded-comment-label, .decoded-btn-wrapper"
      )
      .forEach((el) => el.remove());
    processedPosts = new WeakSet<Element>();
    init();
    return;
  }

  if (m.type === "DECODE_HOVERED") {
    if (!hoveredPost) return;
    const cached = lastResultByPost.get(hoveredPost);
    if (cached) runDecode(hoveredPost, cached.result, cached.text, null, cached.context);
  }
});
