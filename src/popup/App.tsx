import { useState, useEffect, useCallback } from "react";
import {
  ARCHETYPE_COLORS,
  ARCHETYPE_EMOJIS,
  DEFAULT_SETTINGS,
  FREE_DAILY_LIMIT,
  UPGRADE_URL,
  getArchetypeLabel,
  getScoreColor,
  type Archetype,
  type Settings,
  type UsageResponse,
} from "../shared/constants";

interface HistoryEntry {
  hash: string;
  excerpt: string;
  translation: string;
  archetype: Archetype;
  aiScore: number;
  source: "linkedin" | "twitter";
  author?: string;
  authorHandle?: string;
  decodedAt: number;
}

interface AuthorScore {
  author: string;
  handle?: string;
  source: "linkedin" | "twitter";
  totalAIScore: number;
  postCount: number;
  archetypeCounts: Partial<Record<Archetype, number>>;
  lastSeen: number;
}

type Tab = "settings" | "history" | "authors";

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function Toggle({
  label,
  ariaLabel,
  value,
  onChange,
  sublabel,
}: {
  label: string;
  ariaLabel?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  sublabel?: string;
}) {
  return (
    <div style={styles.toggleRow}>
      <div style={styles.toggleInfo}>
        <div style={styles.toggleLabel}>{label}</div>
        {sublabel && <div style={styles.toggleSub}>{sublabel}</div>}
      </div>
      <button
        type="button"
        style={{ ...styles.toggle, ...(value ? styles.toggleOn : styles.toggleOff) }}
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        aria-label={ariaLabel || label || "Toggle"}
      >
        <div
          style={{
            ...styles.toggleThumb,
            transform: value ? "translateX(20px)" : "translateX(2px)",
          }}
        />
      </button>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("settings");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [usage, setUsage] = useState<UsageResponse>({ count: 0, limit: FREE_DAILY_LIMIT });
  const [showApiInput, setShowApiInput] = useState(false);
  const [apiUrlInput, setApiUrlInput] = useState("");
  const [saved, setSaved] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [authors, setAuthors] = useState<AuthorScore[]>([]);

  const loadHistoryAndAuthors = useCallback(() => {
    chrome.storage.local.get(["decode_history", "author_scores"], (result) => {
      setHistory(Array.isArray(result.decode_history) ? result.decode_history : []);
      const scores = (result.author_scores || {}) as Record<string, AuthorScore>;
      setAuthors(Object.values(scores));
    });
  }, []);

  useEffect(() => {
    chrome.storage.local.get(["settings", "usage"], (result) => {
      const merged = { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
      setSettings(merged);
      setApiUrlInput(merged.apiUrl);

      const today = new Date().toISOString().split("T")[0];
      const u = result.usage as { count: number; date: string } | undefined;
      if (u && u.date === today) {
        setUsage({ count: u.count, limit: FREE_DAILY_LIMIT });
      }
    });
    loadHistoryAndAuthors();
  }, [loadHistoryAndAuthors]);

  useEffect(() => {
    if (tab === "history" || tab === "authors") loadHistoryAndAuthors();
  }, [tab, loadHistoryAndAuthors]);

  const clearHistory = () => {
    chrome.storage.local.remove(["decode_history"], () => {
      setHistory([]);
    });
  };

  const clearAuthors = () => {
    chrome.storage.local.remove(["author_scores"], () => {
      setAuthors([]);
    });
  };

  const updateSetting = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      const updated = { ...settings, [key]: value };
      setSettings(updated);
      chrome.storage.local.set({ settings: updated }, () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tabId = tabs[0]?.id;
          if (typeof tabId === "number") {
            chrome.tabs.sendMessage(tabId, { type: "SETTINGS_CHANGED" }).catch(() => {});
          }
        });
      });
    },
    [settings]
  );

  const saveApiUrl = () => {
    updateSetting("apiUrl", apiUrlInput.trim() || DEFAULT_SETTINGS.apiUrl);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const usagePercent = Math.min(100, Math.round((usage.count / Math.max(usage.limit, 1)) * 100));
  const remaining = Math.max(0, usage.limit - usage.count);

  const sortedAuthors = [...authors]
    .filter((a) => a.postCount >= 2)
    .map((a) => ({ ...a, avg: Math.round(a.totalAIScore / a.postCount) }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 30);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.logo}>
          <span style={styles.logoIcon} aria-hidden="true">🔍</span>
          <div>
            <div style={styles.logoName}>Decoded</div>
            <div style={styles.logoTagline}>BS translator for LinkedIn &amp; X</div>
          </div>
        </div>
        <Toggle
          label=""
          ariaLabel="Enable Decoded"
          value={settings.enabled}
          onChange={(v) => updateSetting("enabled", v)}
        />
      </div>

      <div style={styles.tabBar} role="tablist">
        {(["settings", "history", "authors"] as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            style={{ ...styles.tab, ...(tab === id ? styles.tabActive : {}) }}
            onClick={() => setTab(id)}
          >
            {id === "settings" ? "Settings" : id === "history" ? `History (${history.length})` : `Authors (${authors.length})`}
          </button>
        ))}
      </div>

      {tab === "settings" && <>
      <div style={styles.usageSection}>
        <div style={styles.usageHeader}>
          <span style={styles.usageTitle}>Today's decodes</span>
          <span style={styles.usageCount}>
            {usage.count} / {usage.limit}
          </span>
        </div>
        <div style={styles.usageBar} aria-hidden="true">
          <div
            style={{
              ...styles.usageFill,
              width: `${usagePercent}%`,
              background:
                usagePercent >= 100 ? "#ef4444" : usagePercent >= 80 ? "#f97316" : "#4f6ef7",
            }}
          />
        </div>
        {remaining <= 0 ? (
          <div style={styles.usageFull}>
            Daily limit reached.{" "}
            <a href={UPGRADE_URL} target="_blank" rel="noopener" style={styles.upgradeLink}>
              Upgrade to Pro
            </a>
          </div>
        ) : (
          <div style={styles.usageRemaining}>
            {remaining} free decode{remaining !== 1 ? "s" : ""} remaining today
          </div>
        )}
      </div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Display</div>
        <Toggle
          label="Always-on inline mode"
          value={settings.inlineMode}
          onChange={(v) => updateSetting("inlineMode", v)}
          sublabel="Show badges & decode button without hover"
        />
        <Toggle
          label="AI score badge"
          value={settings.showAIScore}
          onChange={(v) => updateSetting("showAIScore", v)}
          sublabel="Show AI% badge on each post"
        />
        <Toggle
          label="Archetype labels"
          value={settings.showArchetypeLabels}
          onChange={(v) => updateSetting("showArchetypeLabels", v)}
          sublabel="Tag each post with its behavior type"
        />
        <Toggle
          label="Auto-collapse engagement bait"
          value={settings.autoCollapseEngagementBait}
          onChange={(v) => updateSetting("autoCollapseEngagementBait", v)}
          sublabel="Hide hard farming posts behind a banner"
        />
        <Toggle
          label="Comment labels"
          value={settings.showCommentLabels}
          onChange={(v) => updateSetting("showCommentLabels", v)}
          sublabel="Flag AI-generated comments"
        />
      </div>

      <div style={styles.section}>
        <div style={styles.shortcutRow}>
          <span style={styles.shortcutLabel}>Decode hovered post</span>
          <kbd style={styles.kbd}>Ctrl/⌘ + Shift + D</kbd>
        </div>
      </div>

      <div style={styles.section}>
        <button
          type="button"
          style={styles.advancedBtn}
          onClick={() => setShowApiInput(!showApiInput)}
          aria-expanded={showApiInput}
        >
          {showApiInput ? "▲" : "▼"} Advanced settings
        </button>
        {showApiInput && (
          <div style={styles.apiSection}>
            <label style={styles.apiLabel} htmlFor="decoded-api-url">
              API endpoint
            </label>
            <div style={styles.apiRow}>
              <input
                id="decoded-api-url"
                style={styles.apiInput}
                value={apiUrlInput}
                onChange={(e) => setApiUrlInput(e.target.value)}
                placeholder="https://your-api.domain/api"
              />
              <button type="button" style={styles.apiSave} onClick={saveApiUrl}>
                {saved ? "✓" : "Save"}
              </button>
            </div>
            <div style={styles.apiHint}>Self-host the Decoded API and enter your URL here.</div>
          </div>
        )}
      </div>

      <div style={styles.footer}>
        <a href={UPGRADE_URL} target="_blank" rel="noopener" style={styles.proBanner}>
          <span style={styles.proBannerIcon} aria-hidden="true">⚡</span>
          <div>
            <div style={styles.proBannerTitle}>Upgrade to Pro · $3/mo</div>
            <div style={styles.proBannerSub}>Unlimited decodes · No watermark · Priority access</div>
          </div>
          <span style={styles.proBannerArrow} aria-hidden="true">→</span>
        </a>
      </div>
      </>}

      {tab === "history" && (
        <div style={styles.tabPanel}>
          {history.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyTitle}>No decodes yet.</div>
              <div style={styles.emptySub}>Click Decode on any LinkedIn or X post to start your local history.</div>
            </div>
          ) : (
            <>
              <div style={styles.listHeader}>
                <span style={styles.listHeaderText}>Last {history.length} decodes</span>
                <button type="button" style={styles.clearBtn} onClick={clearHistory}>
                  Clear
                </button>
              </div>
              <div style={styles.list}>
                {history.map((entry) => {
                  const archetypeColor = ARCHETYPE_COLORS[entry.archetype];
                  const scoreColor = getScoreColor(entry.aiScore);
                  return (
                    <div key={entry.hash + entry.decodedAt} style={styles.historyItem}>
                      <div style={styles.historyMeta}>
                        <span
                          style={{
                            ...styles.historyChip,
                            background: `${archetypeColor}18`,
                            border: `1px solid ${archetypeColor}40`,
                            color: archetypeColor,
                          }}
                        >
                          {ARCHETYPE_EMOJIS[entry.archetype]} {getArchetypeLabel(entry.archetype)}
                        </span>
                        <span style={{ ...styles.historyChip, background: `${scoreColor}18`, border: `1px solid ${scoreColor}40`, color: scoreColor }}>
                          {entry.aiScore}% AI
                        </span>
                        <span style={styles.historySource}>{entry.source === "twitter" ? "X" : "LinkedIn"}</span>
                        <span style={styles.historyTime}>{timeAgo(entry.decodedAt)}</span>
                      </div>
                      {entry.author && <div style={styles.historyAuthor}>{entry.author}</div>}
                      <div style={styles.historyExcerpt}>{entry.excerpt}</div>
                      <div style={styles.historyTranslation}>→ {entry.translation}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "authors" && (
        <div style={styles.tabPanel}>
          {sortedAuthors.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyTitle}>No author data yet.</div>
              <div style={styles.emptySub}>Scroll your LinkedIn or X feed. We need at least 2 posts per author before showing a trust score.</div>
            </div>
          ) : (
            <>
              <div style={styles.listHeader}>
                <span style={styles.listHeaderText}>Top {sortedAuthors.length} by AI score</span>
                <button type="button" style={styles.clearBtn} onClick={clearAuthors}>
                  Clear
                </button>
              </div>
              <div style={styles.list}>
                {sortedAuthors.map((a) => {
                  const color = getScoreColor(a.avg);
                  const dominant = Object.entries(a.archetypeCounts)
                    .sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0))[0];
                  return (
                    <div key={`${a.source}::${a.author}`} style={styles.authorItem}>
                      <div style={styles.authorTop}>
                        <div>
                          <div style={styles.authorName}>{a.author}</div>
                          <div style={styles.authorMeta}>
                            {a.postCount} posts · {a.source === "twitter" ? "X" : "LinkedIn"} · {timeAgo(a.lastSeen)}
                          </div>
                        </div>
                        <div style={{ ...styles.authorScore, color, borderColor: `${color}55`, background: `${color}15` }}>
                          {a.avg}% AI
                        </div>
                      </div>
                      {dominant && (
                        <div style={styles.authorDominant}>
                          Most common: {ARCHETYPE_EMOJIS[dominant[0] as Archetype]} {getArchetypeLabel(dominant[0] as Archetype)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "0 0 8px",
    background: "#0d0d18",
    minHeight: "100px",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 16px 12px",
    borderBottom: "1px solid #1e1e2e",
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  logoIcon: {
    fontSize: "24px",
  },
  logoName: {
    fontSize: "17px",
    fontWeight: "700",
    color: "#f0f0f5",
    lineHeight: "1.1",
  },
  logoTagline: {
    fontSize: "11px",
    color: "#666",
    marginTop: "1px",
  },
  toggle: {
    width: "44px",
    height: "26px",
    borderRadius: "13px",
    border: "none",
    cursor: "pointer",
    position: "relative",
    padding: "0",
    transition: "background 0.15s",
    flexShrink: 0,
  },
  toggleOn: {
    background: "#4f6ef7",
  },
  toggleOff: {
    background: "#333",
  },
  toggleThumb: {
    position: "absolute",
    top: "3px",
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    background: "#fff",
    transition: "transform 0.15s",
    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
  },
  usageSection: {
    padding: "12px 16px",
    borderBottom: "1px solid #1e1e2e",
  },
  usageHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "6px",
  },
  usageTitle: {
    fontSize: "12px",
    color: "#888",
    fontWeight: 500,
  },
  usageCount: {
    fontSize: "12px",
    color: "#bbb",
    fontWeight: 600,
  },
  usageBar: {
    height: "4px",
    background: "#1e1e2e",
    borderRadius: "2px",
    overflow: "hidden",
    marginBottom: "6px",
  },
  usageFill: {
    height: "100%",
    borderRadius: "2px",
    transition: "width 0.3s",
  },
  usageFull: {
    fontSize: "11px",
    color: "#888",
  },
  usageRemaining: {
    fontSize: "11px",
    color: "#666",
  },
  upgradeLink: {
    color: "#7b9dff",
    textDecoration: "none",
    fontWeight: 600,
  },
  section: {
    padding: "10px 16px",
    borderBottom: "1px solid #1a1a28",
  },
  sectionTitle: {
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: "#555",
    textTransform: "uppercase",
    marginBottom: "8px",
  },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "7px 0",
    gap: "12px",
  },
  toggleInfo: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: "13px",
    color: "#ddd",
    fontWeight: 500,
  },
  toggleSub: {
    fontSize: "11px",
    color: "#666",
    marginTop: "1px",
  },
  shortcutRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shortcutLabel: {
    fontSize: "12px",
    color: "#888",
  },
  kbd: {
    display: "inline-block",
    padding: "3px 8px",
    background: "#1a1a28",
    border: "1px solid #333",
    borderRadius: "4px",
    fontSize: "11px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    color: "#bbb",
  },
  advancedBtn: {
    background: "transparent",
    border: "none",
    color: "#555",
    cursor: "pointer",
    fontSize: "11px",
    padding: "0",
    fontFamily: "inherit",
  },
  apiSection: {
    marginTop: "10px",
  },
  apiLabel: {
    fontSize: "11px",
    color: "#666",
    display: "block",
    marginBottom: "6px",
  },
  apiRow: {
    display: "flex",
    gap: "6px",
  },
  apiInput: {
    flex: 1,
    background: "#1a1a28",
    border: "1px solid #333",
    borderRadius: "6px",
    padding: "6px 10px",
    fontSize: "12px",
    color: "#ccc",
    fontFamily: "monospace",
    outline: "none",
  },
  apiSave: {
    background: "#4f6ef7",
    border: "none",
    borderRadius: "6px",
    padding: "6px 12px",
    color: "#fff",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  apiHint: {
    fontSize: "10px",
    color: "#555",
    marginTop: "4px",
  },
  footer: {
    padding: "10px 16px 8px",
  },
  proBanner: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 12px",
    background: "#4f6ef712",
    border: "1px solid #4f6ef730",
    borderRadius: "8px",
    textDecoration: "none",
    transition: "background 0.15s",
  },
  proBannerIcon: {
    fontSize: "18px",
    flexShrink: 0,
  },
  proBannerTitle: {
    fontSize: "13px",
    fontWeight: 700,
    color: "#7b9dff",
    lineHeight: "1.2",
  },
  proBannerSub: {
    fontSize: "10px",
    color: "#555",
    marginTop: "1px",
  },
  proBannerArrow: {
    color: "#4f6ef7",
    fontSize: "16px",
    marginLeft: "auto",
    flexShrink: 0,
  },
  tabBar: {
    display: "flex",
    borderBottom: "1px solid #1e1e2e",
    background: "#0a0a14",
  },
  tab: {
    flex: 1,
    padding: "10px 8px",
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "#666",
    fontSize: "11px",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.15s",
  },
  tabActive: {
    color: "#7b9dff",
    borderBottom: "2px solid #4f6ef7",
    background: "#0d0d18",
  },
  tabPanel: {
    padding: "10px 0",
  },
  emptyState: {
    padding: "30px 20px",
    textAlign: "center",
  },
  emptyTitle: {
    fontSize: "13px",
    color: "#888",
    fontWeight: 600,
    marginBottom: "6px",
  },
  emptySub: {
    fontSize: "11px",
    color: "#555",
    lineHeight: 1.5,
  },
  listHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0 16px 8px",
    borderBottom: "1px solid #1a1a28",
    marginBottom: "4px",
  },
  listHeaderText: {
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: "#555",
    textTransform: "uppercase",
  },
  clearBtn: {
    background: "transparent",
    border: "1px solid #2a2a3a",
    borderRadius: "4px",
    padding: "3px 8px",
    color: "#888",
    fontSize: "10px",
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 600,
  },
  list: {
    maxHeight: "440px",
    overflowY: "auto",
    padding: "0 12px",
  },
  historyItem: {
    padding: "10px 8px",
    borderBottom: "1px solid #14141f",
  },
  historyMeta: {
    display: "flex",
    flexWrap: "wrap",
    gap: "4px",
    alignItems: "center",
    marginBottom: "6px",
  },
  historyChip: {
    fontSize: "10px",
    padding: "2px 6px",
    borderRadius: "8px",
    fontWeight: 600,
  },
  historySource: {
    fontSize: "10px",
    color: "#666",
    fontWeight: 500,
  },
  historyTime: {
    fontSize: "10px",
    color: "#444",
    marginLeft: "auto",
  },
  historyAuthor: {
    fontSize: "11px",
    color: "#aaa",
    fontWeight: 600,
    marginBottom: "3px",
  },
  historyExcerpt: {
    fontSize: "11px",
    color: "#777",
    lineHeight: 1.5,
    marginBottom: "4px",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden",
  },
  historyTranslation: {
    fontSize: "12px",
    color: "#cfd6e3",
    lineHeight: 1.5,
    fontStyle: "italic",
    background: "#14141f",
    borderLeft: "2px solid #4f6ef755",
    padding: "5px 8px",
    borderRadius: "3px",
  },
  authorItem: {
    padding: "10px 8px",
    borderBottom: "1px solid #14141f",
  },
  authorTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "10px",
  },
  authorName: {
    fontSize: "13px",
    color: "#ddd",
    fontWeight: 600,
    marginBottom: "2px",
  },
  authorMeta: {
    fontSize: "10px",
    color: "#555",
  },
  authorScore: {
    fontSize: "12px",
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: "10px",
    border: "1px solid",
    flexShrink: 0,
  },
  authorDominant: {
    fontSize: "10px",
    color: "#666",
    marginTop: "5px",
  },
};
