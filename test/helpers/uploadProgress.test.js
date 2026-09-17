const test = require("node:test");
const assert = require("node:assert/strict");

const {
  formatBytes,
  percentComplete,
  formatBar,
  formatUploadProgress,
  createUploadIndicator,
} = require("../../scripts/release/progress");

test("formatBytes uses compact binary units", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(-1), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1024), "1 KB");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(10 * 1024), "10 KB");
  assert.equal(formatBytes(120 * 1024 * 1024), "120 MB");
});

test("percentComplete clamps and treats empty files as done", () => {
  assert.equal(percentComplete(0, 0), 100);
  assert.equal(percentComplete(0, 100), 0);
  assert.equal(percentComplete(50, 100), 50);
  assert.equal(percentComplete(100, 100), 100);
  assert.equal(percentComplete(150, 100), 100);
});

test("formatBar fills from left", () => {
  assert.equal(formatBar(0, 4), "[----]");
  assert.equal(formatBar(50, 4), "[##--]");
  assert.equal(formatBar(100, 4), "[####]");
});

test("formatUploadProgress includes index, bar, percent, and sizes", () => {
  const line = formatUploadProgress({
    fileName: "EchoCraft-darwin-arm64.zip",
    fileSize: 100,
    transferred: 50,
    index: 1,
    total: 4,
  });
  assert.match(line, /\[1\/4\] uploading EchoCraft-darwin-arm64\.zip/);
  assert.match(line, /50%/);
  assert.match(line, /50 B \/ 100 B/);
  assert.equal(
    formatUploadProgress({
      fileName: "latest-mac.yml",
      fileSize: 20,
      transferred: 20,
      index: 4,
      total: 4,
      done: true,
    }).includes("uploaded"),
    true
  );
});

test("createUploadIndicator rewrites a TTY line and finalizes with a newline", () => {
  const chunks = [];
  const stream = {
    isTTY: true,
    write(chunk) {
      chunks.push(chunk);
      return true;
    },
  };
  let now = 0;
  const indicator = createUploadIndicator({
    stream,
    isTTY: true,
    now: () => now,
    intervalMs: 200,
  });

  indicator.start({
    fileName: "EchoCraft-win32-x64.exe",
    fileSize: 100,
    index: 1,
    total: 2,
  });
  now = 50;
  indicator.progress({
    fileName: "EchoCraft-win32-x64.exe",
    fileSize: 100,
    transferred: 5,
    index: 1,
    total: 2,
  });
  now = 250;
  indicator.progress({
    fileName: "EchoCraft-win32-x64.exe",
    fileSize: 100,
    transferred: 50,
    index: 1,
    total: 2,
  });
  indicator.progress({
    fileName: "EchoCraft-win32-x64.exe",
    fileSize: 100,
    transferred: 100,
    index: 1,
    total: 2,
    done: true,
  });

  assert.equal(chunks[0].startsWith("\r"), true);
  assert.equal(chunks.some((chunk) => chunk.includes("5%")), false);
  assert.equal(chunks.some((chunk) => chunk.includes("50%")), true);
  assert.equal(chunks.at(-1), "\n");
  assert.match(chunks.at(-2), /uploaded EchoCraft-win32-x64\.exe/);
});

test("createUploadIndicator writes discrete non-TTY lines", () => {
  const chunks = [];
  const stream = {
    isTTY: false,
    write(chunk) {
      chunks.push(chunk);
      return true;
    },
  };
  const indicator = createUploadIndicator({
    stream,
    isTTY: false,
    now: () => 0,
    intervalMs: 2000,
  });
  indicator.start({
    fileName: "latest.yml",
    fileSize: 8,
    index: 2,
    total: 2,
  });
  indicator.progress({
    fileName: "latest.yml",
    fileSize: 8,
    transferred: 8,
    index: 2,
    total: 2,
    done: true,
  });
  assert.equal(chunks.every((chunk) => chunk.endsWith("\n")), true);
  assert.match(chunks[0], /uploading latest\.yml/);
  assert.match(chunks[1], /uploaded latest\.yml/);
});
