import { useState, useEffect, useCallback } from "react";
import {
  DEFAULT_SETTINGS,
  FREE_DAILY_LIMIT,
  UPGRADE_URL,
  type Settings,
  type UsageResponse,
} from "../shared/constants";

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
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [usage, setUsage] = useState<UsageResponse>({ count: 0, limit: FREE_DAILY_LIMIT });
  const [showApiInput, setShowApiInput] = useState(false);
  const [apiUrlInput, setApiUrlInput] = useState("");
  const [saved, setSaved] = useState(false);

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
  }, []);

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

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.logo}>
          <span style={styles.logoIcon} aria-hidden="true">🔍</span>
          <div>
            <div style={styles.logoName}>Decoded</div>
            <div style={styles.logoTagline}>BS translator for LinkedIn</div>
          </div>
        </div>
        <Toggle
          label=""
          ariaLabel="Enable Decoded"
          value={settings.enabled}
          onChange={(v) => updateSetting("enabled", v)}
        />
      </div>

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
};
