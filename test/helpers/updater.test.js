const test = require("node:test");
const { afterEach, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

process.env.NODE_ENV = "test";

const updaterModulePath = require.resolve("../../src/updater.js");
const originalLoad = Module._load;

const STARTUP_DELAY_MS = 3000;
const PERIODIC_INTERVAL_MS = 4 * 60 * 60 * 1000;
const EXPECTED_FEED_URL =
  "https://storage.mantisware.co.za/public.php/dav/files/T9p24tDSSKr5jG7/app/";

function makeAutoUpdater() {
  const listeners = {};
  const autoUpdater = {
    calls: 0,
    feedUrls: [],
    channel: null,
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

function createUpdateManager(autoUpdater, { nodeEnv = "test" } = {}) {
  process.env.NODE_ENV = nodeEnv;
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
  delete require.cache[updaterModulePath];
  process.env.NODE_ENV = "test";
});

test("configures the generic Nextcloud feed on the stable latest channel", () => {
  const autoUpdater = makeAutoUpdater();
  const manager = createUpdateManager(autoUpdater);
  const { UPDATE_FEED_URL, UPDATE_CHANNEL, AUTO_UPDATES_SUPPORTED } = require(updaterModulePath);

  assert.equal(AUTO_UPDATES_SUPPORTED, true);
  assert.equal(UPDATE_FEED_URL, EXPECTED_FEED_URL);
  assert.equal(UPDATE_CHANNEL, "latest");
  assert.deepEqual(autoUpdater.feedUrls, [
    {
      provider: "generic",
      url: EXPECTED_FEED_URL,
    },
  ]);
  assert.equal(autoUpdater.channel, "latest");
  assert.ok(autoUpdater.listeners["checking-for-update"]);
  assert.ok(autoUpdater.listeners["update-available"]);
  assert.ok(autoUpdater.listeners["update-downloaded"]);

  manager.cleanup();
});

test("does not configure a GitHub or architecture-specific feed", () => {
  const autoUpdater = makeAutoUpdater();
  const manager = createUpdateManager(autoUpdater);

  assert.equal(autoUpdater.feedUrls[0]?.provider, "generic");
  assert.equal(autoUpdater.feedUrls[0]?.owner, undefined);
  assert.equal(autoUpdater.feedUrls[0]?.repo, undefined);
  assert.equal(autoUpdater.channel, "latest");
  assert.notEqual(autoUpdater.channel, "latest-arm64");
  assert.notEqual(autoUpdater.channel, "latest-x64");

  manager.cleanup();
});

test("development mode skips feed setup, events, and scheduled checks", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const autoUpdater = makeAutoUpdater();
  const manager = createUpdateManager(autoUpdater, { nodeEnv: "development" });

  assert.deepEqual(autoUpdater.feedUrls, []);
  assert.deepEqual(Object.keys(autoUpdater.listeners), []);

  manager.checkForUpdatesOnStartup();
  t.mock.timers.tick(STARTUP_DELAY_MS);
  t.mock.timers.tick(PERIODIC_INTERVAL_MS);
  assert.equal(autoUpdater.calls, 0);

  manager.cleanup();
});

test("startup schedules a delayed check and a four-hour periodic check", (t) => {
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
  assert.equal(autoUpdater.calls, 0);

  t.mock.timers.tick(STARTUP_DELAY_MS);
  assert.equal(autoUpdater.calls, 1);

  t.mock.timers.tick(PERIODIC_INTERVAL_MS);
  assert.equal(autoUpdater.calls, 2);

  manager.cleanup();
});

test("ignores the live v1 0.11.12 feed as an update", () => {
  const autoUpdater = makeAutoUpdater();
  const manager = createUpdateManager(autoUpdater);
  const sent = [];
  manager.setWindowManager({
    mainWindow: makeRendererWindow(sent),
    controlPanelWindow: makeRendererWindow(sent),
  });

  autoUpdater.listeners["update-available"]({ version: "0.11.12" });

  assert.equal(manager.updateAvailable, false);
  assert.deepEqual(sent, ["update-not-available", "update-not-available"]);

  manager.cleanup();
});

test("a manual Check for Updates reaches the configured feed", async () => {
  const autoUpdater = makeAutoUpdater();
  const manager = createUpdateManager(autoUpdater);

  const result = await manager.checkForUpdates();

  assert.equal(autoUpdater.calls, 1);
  assert.equal(result.updateAvailable, false);
  assert.match(result.message, /latest version/);

  manager.cleanup();
});

test("downloading an update reaches the feed", async () => {
  const autoUpdater = makeAutoUpdater();
  const manager = createUpdateManager(autoUpdater);

  const result = await manager.downloadUpdate();

  assert.equal(autoUpdater.calls, 1);
  assert.equal(result.success, true);

  manager.cleanup();
});

test("development mode answers locally instead of reaching a feed", async () => {
  const autoUpdater = makeAutoUpdater();
  const manager = createUpdateManager(autoUpdater, { nodeEnv: "development" });

  const check = await manager.checkForUpdates();
  const download = await manager.downloadUpdate();

  assert.equal(autoUpdater.calls, 0);
  assert.equal(check.updateAvailable, false);
  assert.match(check.message, /development mode/);
  assert.equal(download.success, false);
  assert.match(download.message, /development mode/);

  manager.cleanup();
});
