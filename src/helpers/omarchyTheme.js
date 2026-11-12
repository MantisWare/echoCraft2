const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
let sharedTheme = { css: () => "", parse: () => null }; try { sharedTheme = require(path.join(os.homedir(), ".local/share/mia-desktop/palette.cjs")); } catch {}
const { execFileSync } = require("node:child_process");

function buildThemeCss(raw, font = "monospace") {
  const colors = {};
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([a-z_]+)\s*=\s*["'](#[a-fA-F0-9]{6})["']/);
    if (match) colors[match[1]] = match[2];
  }
  if (!colors.background || !colors.foreground || !colors.accent) return null;
  const bg = colors.background,
    fg = colors.foreground,
    accent = colors.accent;
  const surface = colors.lighter_background || bg;
  const muted = colors.light_foreground || fg;
  const border = `color-mix(in srgb, ${fg} 20%, ${bg})`;
  const tokens = {
    background: bg,
    foreground: fg,
    card: surface,
    "card-foreground": fg,
    popover: surface,
    "popover-foreground": fg,
    primary: accent,
    "primary-foreground": bg,
    secondary: surface,
    "secondary-foreground": fg,
    muted: surface,
    "muted-foreground": muted,
    accent,
    "accent-foreground": bg,
    "agent-brand": accent,
    border,
    input: bg,
    ring: accent,
    link: accent,
    success: colors.green || accent,
    "success-foreground": bg,
    warning: colors.yellow || accent,
    "warning-foreground": bg,
    destructive: colors.red || accent,
    "destructive-foreground": bg,
    info: colors.blue || accent,
    "info-foreground": bg,
    "surface-0": bg,
    "surface-1": colors.dark_background || bg,
    "surface-2": surface,
    "surface-3": colors.muted || surface,
    "surface-raised": colors.selection || surface,
    "border-subtle": border,
    "border-hover": muted,
    "border-active": accent,
  };
  const definitions = Object.entries(tokens)
    .map(([key, value]) => `--color-${key}: ${value} !important;`)
    .join("\n");
  return `:root, body, .dark, .onboarding-canvas {
    ${definitions}
    --font-family-sans: ${JSON.stringify(font)}, monospace !important;
    --font-sans: ${JSON.stringify(font)}, monospace !important;
    --radius: 6px !important; --radius-lg: 8px !important; --radius-xl: 8px !important;
    --shadow-glass: none !important;
    --shadow-selected-glow: inset 0 0 0 1px ${accent} !important;
    --shadow-modal: 0 12px 36px #0005 !important;
    --onboarding-accent: ${accent} !important;
    --onboarding-accent-foreground: ${bg} !important;
    --onboarding-text-primary: ${fg} !important;
    --onboarding-text-secondary: ${muted} !important;
    --onboarding-text-tertiary: ${muted} !important;
    --onboarding-surface: ${bg} !important;
    --onboarding-surface-secondary: ${surface} !important;
    --onboarding-surface-tertiary: ${surface} !important;
    --onboarding-control-border: ${border} !important;
  }
  body, button, input, textarea, select { font-family: var(--font-family-sans) !important; }
  body { font-size: 13px; }
  /* Translucent bubble surface; keep the waveform and controls fully readable. */
  .voice-pill-control:not([data-integrated-with-panel="true"]) {
    background-color: color-mix(in srgb, ${bg} 25%, transparent) !important;
  }
  .rounded-xl, .rounded-2xl, [role="dialog"] { border-radius: 8px !important; }
  .processing-signal-glow {
    --signal-bright: ${accent} !important; --signal-core: ${accent} !important;
    --signal-deep: ${surface} !important; --signal-head: ${fg} !important;
  }
  ::selection { background: ${colors.selection || surface}; color: ${fg}; }
  `;
}

function installOmarchyTheme(app) {
  const themePath = path.join(os.homedir(), ".local/state/omarchy/current/theme/colors.toml");
  const windows = new Map();
  let css = "";
  function read() {
    try {
      let font = "monospace";
      try {
        font = execFileSync("fc-match", ["-f", "%{family[0]}", "monospace"], {
          encoding: "utf8",
          timeout: 2000,
        }).trim();
      } catch {}
      const raw = fs.readFileSync(themePath, "utf8");
      css = (buildThemeCss(raw, font) || "") + sharedTheme.css(sharedTheme.parse(raw), "echo") || css;
    } catch {} // Keep the last valid theme during Omarchy's atomic replacement.
  }
  async function apply(contents) {
    if (!css || contents.isDestroyed() || !contents.getURL().startsWith("file:")) return;
    const previous = windows.get(contents);
    try {
      const key = await contents.insertCSS(css, { cssOrigin: "user" });
      windows.set(contents, key);
      if (previous) await contents.removeInsertedCSS(previous);
    } catch {}
  }
  read();
  app.on("web-contents-created", (_event, contents) => {
    windows.set(contents, null);
    contents.on("did-finish-load", () => {
      windows.set(contents, null);
      void apply(contents);
    });
    contents.on("destroyed", () => windows.delete(contents));
  });
  fs.watchFile(themePath, { interval: 2000 }, () => {
    read();
    for (const contents of windows.keys()) void apply(contents);
  });
  app.on("will-quit", () => fs.unwatchFile(themePath));
}

module.exports = { buildThemeCss, installOmarchyTheme };
