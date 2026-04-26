import { type RuntimeMessage, type Settings } from "../shared/constants";
import { classifyPost } from "./classifier";
import { syncAuthorScore } from "./backendSync";
import { getSettings, recordAuthorScore } from "./storage";
import {
  configurePlatformSelectors,
  injectAIScoreBadge,
  injectArchetypeBadge,
  injectAuthorTrustBadge,
  injectDecodeButton,
  runDecode,
  type DecodeContext,
} from "./injector";

configurePlatformSelectors({
  actionBar: ['[role="group"]'],
  authorHeader: ['[data-testid="User-Name"]'],
});

const POST_SELECTOR = 'article[data-testid="tweet"]';

let processedPosts = new WeakSet<Element>();
let hoveredPost: Element | null = null;
const lastResultByPost = new WeakMap<
  Element,
  { result: ReturnType<typeof classifyPost>; text: string; context: DecodeContext }
>();

function extractTweetText(postEl: Element): string {
  const textEl = postEl.querySelector('[data-testid="tweetText"]');
  if (textEl?.textContent?.trim()) return textEl.textContent.trim();
  return "";
}

function extractTweetAuthor(
  postEl: Element
): { name: string; handle?: string } | null {
  const userBlock = postEl.querySelector('[data-testid="User-Name"]');
  if (!userBlock) return null;

  const links = Array.from(userBlock.querySelectorAll("a[href^='/']")) as HTMLAnchorElement[];
  let name = "";
  let handle: string | undefined;

  for (const a of links) {
    const text = a.textContent?.trim() ?? "";
    const path = (a.getAttribute("href") || "").replace(/^\//, "");
    if (text.startsWith("@")) {
      handle = text.replace(/^@/, "");
    } else if (text && !name) {
      name = text;
    }
    if (!handle && path && !path.includes("/")) {
      handle = path;
    }
  }

  if (!name && handle) name = handle;
  if (!name) return null;
  return { name, handle };
}

async function processTweet(postEl: Element, settings: Settings): Promise<void> {
  if (processedPosts.has(postEl)) return;

  const text = extractTweetText(postEl);
  if (!text || text.length < 30) return;

  processedPosts.add(postEl);
  if (!settings.enabled) return;

  const result = classifyPost(text);
  const author = extractTweetAuthor(postEl);
  const context: DecodeContext = {
    source: "twitter",
    author: author?.name,
    authorHandle: author?.handle,
    settings,
  };
  lastResultByPost.set(postEl, { result, text, context });

  if (author?.name) {
    void recordAuthorScore(author.name, result.archetype, result.aiScore, "twitter", author.handle).then(
      (score) => {
        if (score) void syncAuthorScore(settings, score);
      },
    );
  }

  const inline = settings.inlineMode;

  if (settings.showAIScore) {
    injectAIScoreBadge(postEl, result, inline);
  }

  if (settings.showArchetypeLabels && result.confidence > 25) {
    injectArchetypeBadge(postEl, result, inline);
  }

  if (author?.name) {
    void injectAuthorTrustBadge(postEl, author.name, "twitter", inline);
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

let scanScheduled = false;
function scheduleScan(settings: Settings): void {
  if (scanScheduled) return;
  scanScheduled = true;
  requestAnimationFrame(() => {
    scanScheduled = false;
    document.querySelectorAll(POST_SELECTOR).forEach((post) => {
      processTweet(post, settings).catch(() => {});
    });
  });
}

async function init(): Promise<void> {
  const settings = await getSettings();
  scheduleScan(settings);

  const observer = new MutationObserver(() => scheduleScan(settings));
  observer.observe(document.body, { childList: true, subtree: true });
}

void init();

document.addEventListener(
  "keydown",
  (event) => {
    if (!event.shiftKey) return;
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.code !== "KeyD") return;

    const target = event.target as Element | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        (target as HTMLElement).isContentEditable)
    ) {
      return;
    }

    const postUnderCursor = hoveredPost ?? document.querySelector(POST_SELECTOR);
    if (!postUnderCursor) return;

    const cached = lastResultByPost.get(postUnderCursor);
    if (!cached) return;

    event.preventDefault();
    runDecode(postUnderCursor, cached.result, cached.text, null, cached.context);
  },
  true
);

chrome.runtime.onMessage.addListener((m: RuntimeMessage) => {
  if (m.type === "SETTINGS_CHANGED") {
    processedPosts = new WeakSet();
    document.querySelectorAll(".decoded-score-badge, .decoded-archetype-badge, .decoded-btn-wrapper, .decoded-collapse-banner, .decoded-trust-badge")
      .forEach((el) => el.remove());
    void getSettings().then((s) => scheduleScan(s));
  }

  if (m.type === "DECODE_HOVERED") {
    if (!hoveredPost) return;
    const cached = lastResultByPost.get(hoveredPost);
    if (cached) runDecode(hoveredPost, cached.result, cached.text, null, cached.context);
  }
});
