const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const cp = require("child_process");
const fs = require("fs");

const downloadUtilsPath = require.resolve("../../scripts/lib/download-utils.js");
const originalLoad = Module._load;
const originalExecFile = cp.execFile;
const originalCreateReadStream = fs.createReadStream;
const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");

function restore() {
  Module._load = originalLoad;
  cp.execFile = originalExecFile;
  fs.createReadStream = originalCreateReadStream;
  Object.defineProperty(process, "platform", originalPlatform);
  delete require.cache[downloadUtilsPath];
}

function loadExtractZip({ runSystemTar, unzipper } = {}) {
  delete require.cache[downloadUtilsPath];
  Module._load = function loadWithMocks(request, parent, isMain) {
    if (request === "../../src/helpers/systemTar") {
      return {
        runSystemTar:
          runSystemTar ??
          (async () => {
            throw new Error("tar not used");
          }),
      };
    }
    if (request === "unzipper") {
      if (unzipper === "missing") {
        const error = new Error("Cannot find module 'unzipper'");
        error.code = "MODULE_NOT_FOUND";
        throw error;
      }
      return unzipper;
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  return require("../../scripts/lib/download-utils").extractZip;
}

test("extractZip on Windows uses tar and does not require unzipper", async (t) => {
  t.after(restore);
  Object.defineProperty(process, "platform", { value: "win32" });

  const tarCalls = [];
  const extractZip = loadExtractZip({
    runSystemTar: async (zipPath, destDir) => {
      tarCalls.push([zipPath, destDir]);
    },
    unzipper: "missing",
  });

  await extractZip("C:\\cache\\whisper.zip", "C:\\cache\\extract");
  assert.deepEqual(tarCalls, [["C:\\cache\\whisper.zip", "C:\\cache\\extract"]]);
});

test("extractZip on Windows falls back to Expand-Archive when tar and unzipper fail", async (t) => {
  t.after(restore);
  Object.defineProperty(process, "platform", { value: "win32" });

  const execCalls = [];
  cp.execFile = (command, args, callback) => {
    execCalls.push({ command, args });
    callback(null);
  };

  const extractZip = loadExtractZip({
    runSystemTar: async () => {
      throw new Error("tar extraction timed out");
    },
    unzipper: "missing",
  });

  await extractZip("C:\\cache\\whisper.zip", "C:\\cache\\extract");
  assert.deepEqual(execCalls, [
    {
      command: "powershell",
      args: [
        "-NoProfile",
        "-Command",
        "Expand-Archive -Force -Path 'C:\\cache\\whisper.zip' -DestinationPath 'C:\\cache\\extract'",
      ],
    },
  ]);
});

test("extractZip on Windows uses unzipper when tar fails and unzipper is installed", async (t) => {
  t.after(restore);
  Object.defineProperty(process, "platform", { value: "win32" });

  let extractedTo = null;
  fs.createReadStream = () => ({
    pipe(destination) {
      return destination;
    },
  });

  const extractZip = loadExtractZip({
    runSystemTar: async () => {
      throw new Error("tar extraction failed");
    },
    unzipper: {
      Extract({ path: destDir }) {
        extractedTo = destDir;
        return { promise: async () => {} };
      },
    },
  });

  await extractZip("C:\\cache\\whisper.zip", "C:\\cache\\extract");
  assert.equal(extractedTo, "C:\\cache\\extract");
});
