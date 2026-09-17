const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function electronBuilderTempKeychainPath(projectRoot, tmpDir = os.tmpdir()) {
  const hash = crypto.createHash("sha256").update(projectRoot).update("app-builder").digest("hex");
  return path.join(tmpDir, `${hash}.keychain`);
}

function parseKeychainSearchList(output) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => (line.startsWith('"') && line.endsWith('"') ? line.slice(1, -1) : line));
}

function normalizeKeychainPath(filePath) {
  const resolved = path.resolve(filePath);
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved.replace(/^\/private\/var\//, "/var/");
  }
}

function sameKeychainPath(left, right) {
  return normalizeKeychainPath(left) === normalizeKeychainPath(right);
}

function withoutStaleSigningKeychains(searchList, stalePath) {
  return searchList.filter((item) => !sameKeychainPath(item, stalePath));
}

function listUserKeychains() {
  const output = execFileSync("/usr/bin/security", ["list-keychains", "-d", "user"], {
    encoding: "utf8",
  });
  return parseKeychainSearchList(output);
}

function removeStaleMacSigningKeychains(projectRoot, tmpDir = os.tmpdir()) {
  const stalePath = electronBuilderTempKeychainPath(projectRoot, tmpDir);
  const searchList = listUserKeychains();
  const wasOnList = searchList.some((item) => sameKeychainPath(item, stalePath));
  const existed = fs.existsSync(stalePath);
  if (!wasOnList && !existed) return null;

  const nextList = withoutStaleSigningKeychains(searchList, stalePath);
  if (wasOnList && nextList.length > 0) {
    execFileSync("/usr/bin/security", ["list-keychains", "-d", "user", "-s", ...nextList]);
  }
  try {
    execFileSync("/usr/bin/security", ["delete-keychain", stalePath], {
      stdio: ["ignore", "ignore", "ignore"],
    });
  } catch {
    // Already gone or not a registered keychain.
  }
  if (fs.existsSync(stalePath)) {
    fs.unlinkSync(stalePath);
  }
  return stalePath;
}

module.exports = {
  electronBuilderTempKeychainPath,
  parseKeychainSearchList,
  withoutStaleSigningKeychains,
  removeStaleMacSigningKeychains,
  sameKeychainPath,
};
