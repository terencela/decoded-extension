chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.set({
      settings: {
        enabled: true,
        showAIScore: true,
        autoCollapseEngagementBait: true,
        showCommentLabels: true,
        showArchetypeLabels: true,
        apiUrl: "https://decoded-api.replit.app/api",
      },
      usage: { count: 0, date: new Date().toISOString().split("T")[0] },
    });
  }
});

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  if (typeof msg !== "object" || !msg) {
    sendResponse({ ok: false });
    return true;
  }

  const m = msg as { type: string };

  if (m.type === "GET_USAGE") {
    chrome.storage.local.get(["usage"], (result) => {
      const today = new Date().toISOString().split("T")[0];
      const usage = result.usage;
      if (!usage || usage.date !== today) {
        sendResponse({ count: 0, limit: 5 });
      } else {
        sendResponse({ count: usage.count, limit: 5 });
      }
    });
    return true;
  }

  if (m.type === "USAGE_UPDATED") {
    const um = m as { type: string; count: number };
    chrome.action.setBadgeText({ text: String(um.count) });
    chrome.action.setBadgeBackgroundColor({ color: um.count >= 5 ? "#ef4444" : "#4f6ef7" });
    sendResponse({ ok: true });
    return true;
  }

  sendResponse({ ok: false });
  return true;
});
