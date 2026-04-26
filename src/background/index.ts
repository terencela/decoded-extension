import {
  DEFAULT_SETTINGS,
  FREE_DAILY_LIMIT,
  type RuntimeMessage,
  type UsageResponse,
} from "../shared/constants";

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.set({
      settings: DEFAULT_SETTINGS,
      usage: { count: 0, date: todayString() },
    });
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  }
});

chrome.runtime.onMessage.addListener(
  (msg: unknown, _sender, sendResponse: (response: UsageResponse | { ok: boolean }) => void) => {
    const m = msg as RuntimeMessage;
    if (!m || typeof m !== "object" || !("type" in m)) {
      sendResponse({ ok: false });
      return true;
    }

    if (m.type === "GET_USAGE") {
      chrome.storage.local.get(["usage"], (result) => {
        const today = todayString();
        const usage = result.usage as { count: number; date: string } | undefined;
        if (!usage || usage.date !== today) {
          sendResponse({ count: 0, limit: FREE_DAILY_LIMIT });
        } else {
          sendResponse({ count: usage.count, limit: FREE_DAILY_LIMIT });
        }
      });
      return true;
    }

    if (m.type === "USAGE_UPDATED") {
      const count = m.count;
      chrome.action.setBadgeText({ text: String(count) });
      chrome.action.setBadgeBackgroundColor({
        color: count >= FREE_DAILY_LIMIT ? "#ef4444" : "#4f6ef7",
      });
      sendResponse({ ok: true });
      return true;
    }

    sendResponse({ ok: false });
    return true;
  }
);

if (chrome.commands?.onCommand) {
  chrome.commands.onCommand.addListener((command) => {
    if (command !== "decode-hovered") return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (typeof tabId === "number") {
        chrome.tabs.sendMessage(tabId, { type: "DECODE_HOVERED" }).catch(() => {});
      }
    });
  });
}
