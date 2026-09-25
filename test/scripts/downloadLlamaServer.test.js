const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  BINARIES,
  DARWIN_IMPL_LIB,
  isCompleteInstall,
  libraryDirFor,
  loaderRpath,
  removeFlatLibraries,
} = require("../../scripts/download-llama-server");

test("darwin llama libraries live in separate arch directories", () => {
  const binDir = "/tmp/bin";
  const arm64 = libraryDirFor(binDir, BINARIES["darwin-arm64"]);
  const x64 = libraryDirFor(binDir, BINARIES["darwin-x64"]);

  assert.notEqual(arm64, x64);
  assert.equal(arm64, path.join(binDir, "llama-libs/darwin-arm64"));
  assert.equal(x64, path.join(binDir, "llama-libs/darwin-x64"));
  assert.equal(loaderRpath(BINARIES["darwin-arm64"]), "@loader_path/llama-libs/darwin-arm64");
  assert.equal(loaderRpath(BINARIES["darwin-x64"]), "@loader_path/llama-libs/darwin-x64");
  assert.equal(libraryDirFor(binDir, BINARIES["win32-x64-cpu"]), binDir);
});

test("a darwin install is incomplete until its own impl library and rpath exist", () => {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "llama-install-"));
  const config = BINARIES["darwin-arm64"];
  const binaryPath = path.join(binDir, config.outputName);
  fs.writeFileSync(binaryPath, "");

  assert.equal(isCompleteInstall(binDir, config), false);

  const libDir = libraryDirFor(binDir, config);
  fs.mkdirSync(libDir, { recursive: true });
  fs.writeFileSync(path.join(libDir, DARWIN_IMPL_LIB), "");
  // No Mach-O rpath on an empty file, so the install stays incomplete.
  assert.equal(isCompleteInstall(binDir, config), false);
});

test("extracting an arch removes the same library names from the shared bin directory", () => {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "llama-flat-"));
  const libDir = libraryDirFor(binDir, BINARIES["darwin-arm64"]);
  fs.mkdirSync(libDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, DARWIN_IMPL_LIB), "x86_64");
  fs.writeFileSync(path.join(binDir, "libsherpa-onnx-c-api.dylib"), "keep");

  removeFlatLibraries(binDir, libDir, [DARWIN_IMPL_LIB]);

  assert.equal(fs.existsSync(path.join(binDir, DARWIN_IMPL_LIB)), false);
  assert.equal(fs.existsSync(path.join(binDir, "libsherpa-onnx-c-api.dylib")), true);
});
