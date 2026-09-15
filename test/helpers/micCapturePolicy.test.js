const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CONFERENCING_PROMPT_DELAY_MS,
  DEFAULT_IGNORED_APP_IDS,
  GENERIC_PROMPT_DELAY_MS,
  MIN_REEVALUATION_DELAY_MS,
  classifyCapture,
  decideMicPrompt,
  deriveAppId,
  deriveAppIdentity,
  isConferencingApp,
  normalizeAppId,
  promptDelayMsFor,
} = require("../../src/helpers/micCapturePolicy");

const NOW = 1_000_000;

// The capture that produced the bug report: ChatGPT's helper holds an input
// stream open permanently, so its path has to roll up to the app the user knows.
test("a bundle helper is attributed to the app that contains it", () => {
  assert.deepEqual(
    deriveAppIdentity("/Applications/ChatGPT.app/Contents/Resources/native/system-audio-spectrum"),
    { appId: "chatgpt", appName: "ChatGPT" }
  );
});

test("the outermost app bundle wins, so nested helpers do not become their own app", () => {
  assert.equal(
    deriveAppId("/Applications/zoom.us.app/Contents/Frameworks/Helper.app/Contents/MacOS/Helper"),
    "zoom-us"
  );
});

test("platforms without app bundles fall back to the executable name", () => {
  assert.deepEqual(deriveAppIdentity("C:\\Program Files\\Zoom\\bin\\Zoom.exe"), {
    appId: "zoom",
    appName: "Zoom",
  });
  assert.deepEqual(deriveAppIdentity("/usr/bin/pipewire"), {
    appId: "pipewire",
    appName: "pipewire",
  });
});

test("an unusable executable path is unattributed rather than a bogus app id", () => {
  for (const value of [null, undefined, "", "   ", 42]) {
    assert.deepEqual(deriveAppIdentity(value), { appId: null, appName: null });
  }
});

test("app ids are slugs, so spaces and punctuation cannot split one app in two", () => {
  assert.equal(normalizeAppId("Microsoft Teams"), "microsoft-teams");
  assert.equal(normalizeAppId("  Audio Hijack  "), "audio-hijack");
  assert.equal(normalizeAppId("!!!"), null);
});

test("only dedicated meeting apps get the fast threshold", () => {
  assert.equal(isConferencingApp("zoom"), true);
  assert.equal(promptDelayMsFor("zoom"), CONFERENCING_PROMPT_DELAY_MS);

  // A browser runs Google Meet, but it also runs every site that asks for a
  // mic, so it waits out the generic delay like anything else.
  assert.equal(isConferencingApp("google-chrome"), false);
  assert.equal(promptDelayMsFor("google-chrome"), GENERIC_PROMPT_DELAY_MS);
  assert.equal(promptDelayMsFor(null), GENERIC_PROMPT_DELAY_MS);
});

test("ChatGPT ships in the default ignore list", () => {
  assert.ok(DEFAULT_IGNORED_APP_IDS.includes("chatgpt"));
});

test("classifyCapture reports why a capture is not worth a prompt", () => {
  const ignoredAppIds = ["chatgpt"];

  assert.equal(classifyCapture({ appId: "chatgpt", ignoredAppIds }).decision, "ignore-app");
  assert.equal(classifyCapture({ appId: "audacity", baseline: true }).decision, "ignore-baseline");
  assert.equal(
    classifyCapture({ appId: "audacity", dismissed: true }).decision,
    "ignore-dismissed"
  );
  assert.equal(classifyCapture({ appId: "audacity" }).decision, "prompt");
  assert.equal(classifyCapture({ appId: null }).decision, "prompt");
});

// An explicit ignore is the user's own instruction, so it outranks the reasons
// we infer.
test("the ignore list wins over baseline and dismissal reasons", () => {
  assert.equal(
    classifyCapture({
      appId: "chatgpt",
      ignoredAppIds: ["chatgpt"],
      baseline: true,
      dismissed: true,
    }).decision,
    "ignore-app"
  );
});

test("a conferencing call already underway at startup is still worth a prompt", () => {
  assert.equal(classifyCapture({ appId: "zoom", baseline: true }).decision, "prompt");
});

test("a capture is held until it has been open for its threshold", () => {
  const captures = [{ pid: 1, appId: "audacity", appName: "Audacity", startedAt: NOW }];

  assert.deepEqual(decideMicPrompt({ captures, now: NOW + 2_000 }), {
    action: "wait",
    waitMs: GENERIC_PROMPT_DELAY_MS - 2_000,
  });
  assert.deepEqual(decideMicPrompt({ captures, now: NOW + GENERIC_PROMPT_DELAY_MS }), {
    action: "prompt",
    appId: "audacity",
    appName: "Audacity",
    unattributed: false,
  });
});

test("a wait never resolves to zero, so the re-arm cannot spin", () => {
  const captures = [{ pid: 1, appId: "zoom", startedAt: NOW }];
  const { waitMs } = decideMicPrompt({
    captures,
    now: NOW + CONFERENCING_PROMPT_DELAY_MS - 1,
  });
  assert.equal(waitMs, MIN_REEVALUATION_DELAY_MS);
});

test("a named conferencing app is preferred over a longer-running unknown one", () => {
  const decision = decideMicPrompt({
    captures: [
      { pid: 1, appId: "audacity", appName: "Audacity", startedAt: NOW - 60_000 },
      { pid: 2, appId: "zoom", appName: "Zoom", startedAt: NOW - 3_000 },
    ],
    now: NOW,
  });
  assert.equal(decision.action, "prompt");
  assert.equal(decision.appId, "zoom");
});

test("among equals the longest-running capture is reported", () => {
  const decision = decideMicPrompt({
    captures: [
      { pid: 1, appId: "audacity", appName: "Audacity", startedAt: NOW - 20_000 },
      { pid: 2, appId: "obs", appName: "OBS", startedAt: NOW - 60_000 },
    ],
    now: NOW,
  });
  assert.equal(decision.appId, "obs");
});

test("a permanently-held mic is suppressed no matter how long it runs", () => {
  const captures = [
    { pid: 1, appId: "chatgpt", appName: "ChatGPT", startedAt: NOW - 86_400_000, baseline: true },
  ];
  assert.deepEqual(
    decideMicPrompt({ captures, ignoredAppIds: DEFAULT_IGNORED_APP_IDS, now: NOW }),
    {
      action: "suppress",
    }
  );
});

test("an ignored capture does not mask an eligible one beside it", () => {
  const decision = decideMicPrompt({
    captures: [
      { pid: 1, appId: "chatgpt", appName: "ChatGPT", startedAt: NOW - 86_400_000 },
      { pid: 2, appId: "zoom", appName: "Zoom", startedAt: NOW - 5_000 },
    ],
    ignoredAppIds: ["chatgpt"],
    now: NOW,
  });
  assert.equal(decision.appId, "zoom");
});

// macOS aggregate mode and legacy Windows listeners report activity with no
// attributable pid. Attribution is the whole defense, so with none available the
// pre-attribution behaviour is all that is left.
test("activity with no attributable capture still prompts", () => {
  assert.deepEqual(decideMicPrompt({ captures: [], now: NOW }), {
    action: "prompt",
    appId: null,
    appName: null,
    unattributed: true,
  });
});

test("an unattributable capture prompts on the generic delay", () => {
  const captures = [{ pid: 1, appId: null, appName: null, startedAt: NOW }];

  assert.equal(decideMicPrompt({ captures, now: NOW + 2_000 }).action, "wait");
  const decision = decideMicPrompt({ captures, now: NOW + GENERIC_PROMPT_DELAY_MS });
  assert.equal(decision.action, "prompt");
  assert.equal(decision.unattributed, true);
});

test("an ignore list given as a Set is honoured like an array", () => {
  const captures = [{ pid: 1, appId: "krisp", startedAt: NOW - 60_000 }];
  assert.equal(
    decideMicPrompt({ captures, ignoredAppIds: new Set(["krisp"]), now: NOW }).action,
    "suppress"
  );
});
