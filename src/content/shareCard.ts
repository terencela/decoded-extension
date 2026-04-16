import { type Archetype, getArchetypeLabel } from "./classifier";

const ARCHETYPE_COLORS: Record<Archetype, string> = {
  "failure-laundering": "#ef4444",
  "engagement-farming": "#f97316",
  "status-packaging": "#a855f7",
  "ai-sludge": "#3b82f6",
  "consensus-wisdom": "#6b7280",
};

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
): number {
  const words = text.split(" ");
  let line = "";
  let linesDrawn = 0;

  for (const word of words) {
    const testLine = line + (line ? " " : "") + word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      if (linesDrawn >= maxLines - 1) {
        ctx.fillText(line + "…", x, y + linesDrawn * lineHeight);
        linesDrawn++;
        return linesDrawn;
      }
      ctx.fillText(line, x, y + linesDrawn * lineHeight);
      line = word;
      linesDrawn++;
    } else {
      line = testLine;
    }
  }
  if (line && linesDrawn < maxLines) {
    ctx.fillText(line, x, y + linesDrawn * lineHeight);
    linesDrawn++;
  }
  return linesDrawn;
}

export async function generateShareCard(
  originalExcerpt: string,
  translation: string,
  archetype: Archetype,
  aiScore: number,
  isPro = false
): Promise<Blob> {
  const W = 1200;
  const H = 630;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#0d0d10";
  ctx.fillRect(0, 0, W, H);

  const accentColor = ARCHETYPE_COLORS[archetype];

  ctx.fillStyle = accentColor + "18";
  ctx.fillRect(0, 0, W / 2 - 1, H);

  ctx.fillStyle = accentColor + "30";
  ctx.fillRect(0, 0, 5, H);

  ctx.strokeStyle = "#2a2a35";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2, 50);
  ctx.lineTo(W / 2, H - 50);
  ctx.stroke();

  ctx.font = "bold 32px -apple-system, system-ui, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("Decoded", 48, 68);

  ctx.font = "16px -apple-system, system-ui, sans-serif";
  ctx.fillStyle = "#888";
  ctx.fillText("LinkedIn Translator", 48, 92);

  const archetypeLabel = getArchetypeLabel(archetype);
  const badgeX = W / 2 + 48;
  const badgeY = 48;
  const badgePadX = 18;
  const badgePadY = 10;
  ctx.font = "bold 15px -apple-system, system-ui, sans-serif";
  const badgeW = ctx.measureText(archetypeLabel).width + badgePadX * 2;
  const badgeH = 36;
  ctx.fillStyle = accentColor;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 8);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(archetypeLabel, badgeX + badgePadX, badgeY + badgePadY + 12);

  const scoreLabel = `${aiScore}% AI`;
  const scoreBadgeX = badgeX + badgeW + 12;
  ctx.font = "bold 15px -apple-system, system-ui, sans-serif";
  const scoreW = ctx.measureText(scoreLabel).width + 28;
  ctx.fillStyle = aiScore > 70 ? "#ef4444" : aiScore > 35 ? "#f97316" : "#22c55e";
  roundRect(ctx, scoreBadgeX, badgeY, scoreW, badgeH, 8);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(scoreLabel, scoreBadgeX + 14, badgeY + badgePadY + 12);

  ctx.font = "13px -apple-system, system-ui, sans-serif";
  ctx.fillStyle = "#666";
  ctx.fillText("WHAT WAS WRITTEN", 48, 145);

  ctx.font = "italic 18px Georgia, 'Times New Roman', serif";
  ctx.fillStyle = "#c8c8d0";
  wrapText(ctx, `"${originalExcerpt}"`, 48, 170, W / 2 - 96, 28, 10);

  ctx.font = "13px -apple-system, system-ui, sans-serif";
  ctx.fillStyle = accentColor;
  ctx.fillText("WHAT IT ACTUALLY MEANS", W / 2 + 48, 145);

  ctx.font = "20px -apple-system, system-ui, sans-serif";
  ctx.fillStyle = "#f0f0f5";
  wrapText(ctx, translation, W / 2 + 48, 170, W / 2 - 96, 30, 10);

  if (!isPro) {
    ctx.font = "bold 16px -apple-system, system-ui, sans-serif";
    ctx.fillStyle = "#555";
    ctx.fillText("via Decoded", W - 200, H - 36);
  }

  ctx.font = "13px -apple-system, system-ui, sans-serif";
  ctx.fillStyle = "#444";
  ctx.fillText("decoded.app", 48, H - 36);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/png");
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export async function downloadShareCard(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "decoded-card.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyShareCardToClipboard(blob: Blob): Promise<boolean> {
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);
    return true;
  } catch {
    return false;
  }
}
