const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { MAC_SIGNING_IDENTITY, MAC_TEAM_ID } = require("./constants");

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

// codesign -dv writes its report to stderr, so stdout alone is always empty.
function runCombined(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status}: ${result.stderr ?? ""}`);
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function findMacApp(outputDir) {
  const candidates = [];
  if (!fs.existsSync(outputDir)) return null;

  for (const entry of fs.readdirSync(outputDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith("mac")) continue;
    const appPath = path.join(outputDir, entry.name, "EchoCraft.app");
    if (fs.existsSync(appPath)) candidates.push(appPath);
  }

  return candidates[0] ?? null;
}

function verifyMacSignature(appPath) {
  if (!appPath || !fs.existsSync(appPath)) {
    throw new Error("EchoCraft.app was not found in dist/ for signature verification");
  }

  run("codesign", ["--verify", "--deep", "--strict", appPath]);
  const details = runCombined("codesign", ["-dv", "--verbose=4", appPath]);
  if (!details.includes(MAC_TEAM_ID)) {
    throw new Error(`macOS signature is missing Team ID ${MAC_TEAM_ID}`);
  }
  if (!details.includes(MAC_SIGNING_IDENTITY) && !details.includes("Waldo Marais")) {
    throw new Error(`macOS signature is not ${MAC_SIGNING_IDENTITY}`);
  }
  if (!/Runtime=Hardened/.test(details) && !details.includes("flags=0x10000")) {
    // codesign -dv prints "CodeDirectory ... flags=0x10000(runtime)" for hardened runtime
    if (!details.includes("(runtime)")) {
      throw new Error("macOS app is not signed with the hardened runtime");
    }
  }

  try {
    run("xcrun", ["stapler", "validate", appPath]);
  } catch (error) {
    throw new Error(
      `macOS notarization staple is missing or invalid: ${error.stderr ?? error.message}`
    );
  }

  return { appPath, details };
}

function verifyWindowsInstaller(exePath) {
  if (!exePath || !fs.existsSync(exePath)) {
    throw new Error("Windows installer was not found for release verification");
  }

  return { exePath };
}

function verifyLinuxArtifacts(filePaths) {
  const appImage = filePaths.find((filePath) => filePath.endsWith(".AppImage"));
  if (!appImage) {
    throw new Error("Linux release is missing an AppImage");
  }
  return { appImage };
}

function hasMacSigningIdentity(teamId = MAC_TEAM_ID) {
  const output = run("/usr/bin/security", ["find-identity", "-v", "-p", "codesigning"]);
  return output.includes(teamId);
}

function requireMacSigningIdentity(teamId = MAC_TEAM_ID) {
  if (!hasMacSigningIdentity(teamId)) {
    throw new Error(
      `${MAC_SIGNING_IDENTITY} is not in the login keychain. Import the Developer ID certificate in Keychain Access before releasing.`
    );
  }
}

module.exports = {
  findMacApp,
  hasMacSigningIdentity,
  requireMacSigningIdentity,
  verifyMacSignature,
  verifyWindowsInstaller,
  verifyLinuxArtifacts,
};
