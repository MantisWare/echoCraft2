const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { parseArgs, formatUnsupportedPlatformError } = require("../../scripts/lib/download-utils");
const { BINARIES: whisperBinaries } = require("../../scripts/download-whisper-cpp");

const PACKAGE_JSON = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8")
);
const ELECTRON_BUILDER = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "electron-builder.json"), "utf8")
);

function parse(overrides) {
  return parseArgs({
    env: {},
    hostPlatform: "darwin",
    hostArch: "arm64",
    argv: ["node", "download.js", "--current"],
    ...overrides,
  });
}

test("Linux current target is x64 on an arm64 host (no published linux-arm64 sidecars)", () => {
  const fromFlag = parse({
    argv: ["node", "download.js", "--current", "--platform", "linux"],
  });
  assert.equal(fromFlag.platformArch, "linux-x64");

  const fromEnv = parse({
    env: { TARGET_PLATFORM: "linux" },
    hostPlatform: "linux",
    hostArch: "arm64",
  });
  assert.equal(fromEnv.platformArch, "linux-x64");

  const nativeLinuxArmHost = parse({
    hostPlatform: "linux",
    hostArch: "arm64",
  });
  assert.equal(nativeLinuxArmHost.platformArch, "linux-x64");
});

test("an explicit Linux arch is preserved", () => {
  const fromFlag = parse({
    argv: ["node", "download.js", "--current", "--platform", "linux", "--arch", "arm64"],
  });
  assert.equal(fromFlag.platformArch, "linux-arm64");

  const fromEnv = parse({
    env: { TARGET_PLATFORM: "linux", TARGET_ARCH: "arm64" },
    hostPlatform: "linux",
    hostArch: "x64",
  });
  assert.equal(fromEnv.platformArch, "linux-arm64");
});

test("non-Linux hosts keep their native arch", () => {
  assert.equal(parse().platformArch, "darwin-arm64");
  assert.equal(
    parse({ hostPlatform: "win32", hostArch: "x64" }).platformArch,
    "win32-x64"
  );
});

test("linux-arm64 download errors point at the x64 target", () => {
  assert.match(formatUnsupportedPlatformError("linux-arm64"), /--arch x64/);
  assert.equal(formatUnsupportedPlatformError("solaris-x64"), "Unsupported platform/arch: solaris-x64");
});

test("whisper-server is published for linux-x64 only", () => {
  assert.ok(whisperBinaries["linux-x64"]);
  assert.equal(whisperBinaries["linux-arm64"], undefined);
});

test("Linux package scripts pin x64 so electron-builder does not emit linux-arm64", () => {
  assert.match(PACKAGE_JSON.scripts["prebuild:linux"], /--platform linux --arch x64/);
  for (const name of [
    "build:linux",
    "build:linux:appimage",
    "build:linux:deb",
    "build:linux:rpm",
    "build:linux:tar",
  ]) {
    assert.match(PACKAGE_JSON.scripts[name], /--x64/, `${name} should pass --x64`);
  }

  for (const target of ELECTRON_BUILDER.linux.target) {
    assert.ok(target && typeof target === "object", "linux.target entries should pin arch");
    assert.deepEqual(target.arch, ["x64"]);
  }
});
