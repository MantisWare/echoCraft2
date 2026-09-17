const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { validateSchema } = require("app-builder-lib/out/util/config/schemaValidator");

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA = require("app-builder-lib/scheme.json");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function mergeWinOverlay(base, overlay) {
  return {
    ...base,
    win: {
      ...base.win,
      ...overlay.win,
      signtoolOptions: {
        ...base.win?.signtoolOptions,
        ...overlay.win?.signtoolOptions,
      },
    },
  };
}

test("electron-builder.json matches the electron-builder 26 schema", () => {
  const config = readJson("electron-builder.json");
  assert.doesNotThrow(() =>
    validateSchema(SCHEMA, config, { name: "electron-builder" })
  );
});

test("mac.identity omits the prefix electron-builder rejects", () => {
  const config = readJson("electron-builder.json");
  assert.equal(config.mac.identity, "Waldo Marais (Z2BVWT9X93)");
  assert.equal(config.mac.identity.startsWith("Developer ID Application:"), false);
});

test("unsigned Windows overlay still matches the electron-builder 26 schema", () => {
  const base = readJson("electron-builder.json");
  const overlay = readJson("electron-builder.unsigned-win.json");
  const { extends: _extends, ...overlayRest } = overlay;
  const config = mergeWinOverlay(base, overlayRest);
  assert.doesNotThrow(() =>
    validateSchema(SCHEMA, config, { name: "electron-builder" })
  );
});
