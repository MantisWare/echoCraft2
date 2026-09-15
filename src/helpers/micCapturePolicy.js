// Decides whether a microphone capture looks like a meeting worth prompting
// for. Pure and shared with the renderer (the Settings ignore list needs the
// same app-id derivation the detector applies), so nothing here may touch I/O.
//
// The mic signals only say "some process is capturing". Plenty of apps hold an
// input stream open permanently without anyone being in a meeting (ChatGPT's
// audio-spectrum helper, Krisp, Loopback, OBS), which is why attribution and
// not raw activity is what arms a prompt.

// A named conferencing app is strong evidence on its own, so it prompts as soon
// as the capture is sustained. Anything else — an unattributable capture, a
// browser tab, a recorder — waits long enough that a mic check or a Siri
// invocation cannot produce a card.
export const CONFERENCING_PROMPT_DELAY_MS = 2_000;
export const GENERIC_PROMPT_DELAY_MS = 10_000;
// A "wait" verdict re-arms a timer, so it can never resolve to zero.
export const MIN_REEVALUATION_DELAY_MS = 250;

// Seeds the user-managed ignore list. These are apps whose whole job involves
// holding the mic open, so their capture carries no meeting signal at all.
export const DEFAULT_IGNORED_APP_IDS = Object.freeze([
  "chatgpt",
  "krisp",
  "loopback",
  "audio-hijack",
  "soundsource",
  "elgato-stream-deck",
  "stream-deck",
  "obs",
]);

// Dedicated meeting apps only. Browsers are deliberately absent: Google Meet
// runs in one, but so does every website that asks for a mic, so a browser gets
// the generic delay and no baseline exemption.
export const CONFERENCING_APP_IDS = Object.freeze([
  "zoom",
  "zoom-us",
  "microsoft-teams",
  "microsoft-teams-classic",
  "teams",
  "webex",
  "cisco-webex-meetings",
  "webexmeetingsapp",
  "facetime",
  "slack",
  "discord",
  "gotomeeting",
  "bluejeans",
  "whereby",
  "ringcentral",
  "amazon-chime",
]);

// The first `.app` segment wins, so a helper buried in Contents/ rolls up to the
// bundle the user actually recognizes.
const APP_BUNDLE_PATTERN = /([^/\\]+)\.app(?=[/\\]|$)/i;
const EXECUTABLE_SUFFIX_PATTERN = /\.(?:exe|com|bat|cmd)$/i;
const NON_ALPHANUMERIC_PATTERN = /[^a-z0-9]+/g;
const EDGE_DASH_PATTERN = /^-+|-+$/g;

const asSet = (values) => (values instanceof Set ? values : new Set(values ?? []));

export const normalizeAppId = (value) => {
  if (typeof value !== "string") return null;
  const normalized = value
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_PATTERN, "-")
    .replace(EDGE_DASH_PATTERN, "");
  return normalized === "" ? null : normalized;
};

// The label a human would recognize: the bundle name on macOS, the executable
// name elsewhere.
export const deriveAppName = (executablePath) => {
  if (typeof executablePath !== "string") return null;
  const trimmed = executablePath.trim();
  if (trimmed === "") return null;

  const bundle = APP_BUNDLE_PATTERN.exec(trimmed);
  if (bundle) return bundle[1];

  const basename = trimmed.split(/[/\\]/).pop() ?? "";
  const stripped = basename.replace(EXECUTABLE_SUFFIX_PATTERN, "");
  return stripped === "" ? null : stripped;
};

export const deriveAppIdentity = (executablePath) => {
  const appName = deriveAppName(executablePath);
  return { appId: normalizeAppId(appName), appName };
};

export const deriveAppId = (executablePath) => deriveAppIdentity(executablePath).appId;

export const isConferencingApp = (appId) =>
  typeof appId === "string" && CONFERENCING_APP_IDS.includes(appId);

export const promptDelayMsFor = (appId) =>
  isConferencingApp(appId) ? CONFERENCING_PROMPT_DELAY_MS : GENERIC_PROMPT_DELAY_MS;

/**
 * Verdict for a single capture. `baseline` means the capture was already open
 * when the listener started, which is the shape a permanently-held mic has;
 * `dismissed` means the user declined a prompt while this same capture was live.
 */
export const classifyCapture = ({
  appId = null,
  ignoredAppIds = [],
  baseline = false,
  dismissed = false,
} = {}) => {
  const conferencing = isConferencingApp(appId);
  const thresholdMs = conferencing ? CONFERENCING_PROMPT_DELAY_MS : GENERIC_PROMPT_DELAY_MS;

  if (appId !== null && asSet(ignoredAppIds).has(appId)) {
    return { decision: "ignore-app", thresholdMs, conferencing };
  }
  // A capture that predates the listener says nothing about when it started, so
  // it is only worth a prompt when we can name it as a conferencing app — that
  // keeps a call already underway at launch detectable without letting an
  // always-on helper prompt forever.
  if (baseline && !conferencing) {
    return { decision: "ignore-baseline", thresholdMs, conferencing };
  }
  if (dismissed) {
    return { decision: "ignore-dismissed", thresholdMs, conferencing };
  }
  return { decision: "prompt", thresholdMs, conferencing };
};

// A named conferencing app beats everything; otherwise the longest-running
// capture is the best guess at what the user is actually talking into.
const pickBestCapture = (candidates) =>
  candidates.reduce((best, candidate) => {
    if (candidate.conferencing !== best.conferencing) {
      return candidate.conferencing ? candidate : best;
    }
    return candidate.startedAt < best.startedAt ? candidate : best;
  });

/**
 * Set-level verdict over every external capture currently open.
 *
 * - `prompt`:   show the meeting card, naming `appName` when we have one.
 * - `wait`:     something is eligible but has not been capturing long enough yet.
 * - `suppress`: nothing open is worth a prompt.
 *
 * An empty `captures` list means the platform could not attribute the activity
 * at all (macOS aggregate fallback, a legacy Windows listener). Attribution is
 * the whole defense, so with none available the pre-attribution behaviour —
 * prompt on sustained activity — is the best that can be done.
 */
export const decideMicPrompt = ({ captures = [], ignoredAppIds = [], now = Date.now() } = {}) => {
  if (captures.length === 0) {
    return { action: "prompt", appId: null, appName: null, unattributed: true };
  }

  const ignored = asSet(ignoredAppIds);
  const ready = [];
  const waits = [];

  for (const capture of captures) {
    const appId = capture.appId ?? null;
    const { decision, thresholdMs, conferencing } = classifyCapture({
      appId,
      ignoredAppIds: ignored,
      baseline: capture.baseline === true,
      dismissed: capture.dismissed === true,
    });
    if (decision !== "prompt") continue;

    const startedAt = capture.startedAt ?? now;
    const elapsedMs = now - startedAt;
    if (elapsedMs >= thresholdMs) {
      ready.push({ ...capture, appId, conferencing, startedAt });
    } else {
      waits.push(thresholdMs - elapsedMs);
    }
  }

  if (ready.length > 0) {
    const best = pickBestCapture(ready);
    return {
      action: "prompt",
      appId: best.appId,
      appName: best.appName ?? null,
      unattributed: best.appId === null,
    };
  }

  if (waits.length > 0) {
    return { action: "wait", waitMs: Math.max(MIN_REEVALUATION_DELAY_MS, Math.min(...waits)) };
  }

  return { action: "suppress" };
};
