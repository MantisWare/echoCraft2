const test = require("node:test");
const { afterEach, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

// This build ships no update feed of its own, and the only feed the code could
// reach is upstream OpenWhispr's, which would replace the app with a different
// one. These tests pin that every update path stays inert: no feed, no
// listeners, no scheduled checks, and no network traffic behind a manual check.
process.env.NODE_ENV = "test";

const updaterModulePath = require.resolve("../../src/updater.js");
const originalLoad = Module._load;

const STARTUP_DELAY_MS = 3000;
const PERIODIC_INTERVAL_MS = 4 * 60 * 60 * 1000;

function makeAutoUpdater() {
  const listeners = {};
  const autoUpdater = {
    calls: 0,
    feedUrls: [],
    listeners,
    setFeedURL(options) {
      autoUpdater.feedUrls.push(options);
    },
    on(event, handler) {
      listeners[event] = handler;
    },
    removeListener() {},
    checkForUpdates() {
      autoUpdater.calls += 1;
      return Promise.resolve({ isUpdateAvailable: false });
    },
    downloadUpdate() {
      autoUpdater.calls += 1;
      return Promise.resolve();
    },
  };
  return autoUpdater;
}

// updater.js requires electron and child_process lazily (constructor, cleanup(),
// Rosetta probe), so the mocks stay installed until afterEach.
function createUpdateManager(autoUpdater) {
  delete require.cache[updaterModulePath];
  Module._load = function loadWithMocks(request, parent, isMain) {
    if (request === "electron-updater") return { autoUpdater };
    if (request === "electron") return { autoUpdater: { on() {}, removeListener() {} } };
    if (request === "child_process") return { execSync: () => "0" };
    return originalLoad.call(this, request, parent, isMain);
  };
  const UpdateManager = require(updaterModulePath);
  return new UpdateManager();
}

function makeRendererWindow(sent) {
  return {
    isDestroyed: () => false,
    webContents: {
      send(channel) {
        sent.push(channel);
      },
    },
  };
}

beforeEach((t) => {
  t.mock.method(console, "log", () => {});
  t.mock.method(console, "error", () => {});
});

afterEach(() => {
  Module._load = originalLoad;
});

test("no update feed is configured and no updater events are subscribed", () => {
  const autoUpdater = makeAutoUpdater();
  const manager = createUpdateManager(autoUpdater);

  assert.deepEqual(autoUpdater.feedUrls, []);
  assert.deepEqual(Object.keys(autoUpdater.listeners), []);

  manager.cleanup();
});

test("startup schedules neither the delayed check nor the periodic one", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const autoUpdater = makeAutoUpdater();
  const manager = createUpdateManager(autoUpdater);
  const sent = [];
  manager.setWindowManager({
    notificationPrefs: { notificationsEnabled: true, notifyUpdates: true },
    mainWindow: makeRendererWindow(sent),
    controlPanelWindow: makeRendererWindow(sent),
  });

  manager.checkForUpdatesOnStartup();
  t.mock.timers.tick(STARTUP_DELAY_MS);
  t.mock.timers.tick(PERIODIC_INTERVAL_MS);

  assert.equal(autoUpdater.calls, 0);
  assert.deepEqual(sent, [], "a build with no feed produces no renderer traffic at all");

  manager.cleanup();
});

test("a manual Check for Updates answers locally instead of reaching a feed", async () => {
  const autoUpdater = makeAutoUpdater();
  const manager = createUpdateManager(autoUpdater);

  const result = await manager.checkForUpdates();

  assert.equal(autoUpdater.calls, 0);
  assert.equal(result.updateAvailable, false);
  assert.match(result.message, /not available in this build/);

  manager.cleanup();
});

test("downloading an update reports that this build has none", async () => {
  const autoUpdater = makeAutoUpdater();
  const manager = createUpdateManager(autoUpdater);

  const result = await manager.downloadUpdate();

  assert.equal(autoUpdater.calls, 0);
  assert.equal(result.success, false);
  assert.match(result.message, /not available in this build/);

  manager.cleanup();
});
