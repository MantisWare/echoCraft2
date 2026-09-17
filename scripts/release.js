#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {
  PUBLIC_SHARE_URL,
} = require("./release/constants");
const {
  applyEnvToProcess,
  loadReleaseEnv,
  prepareBuildEnv,
  requireReleaseCredentials,
} = require("./release/env");
const {
  parseArgs,
  validateNativeHost,
} = require("./release/platform");
const {
  buildUploadPlan,
  listOutputFiles,
  parseUpdateYml,
  readPackageIdentity,
  selectReleaseArtifacts,
  validateManifest,
} = require("./release/artifacts");
const {
  findMacApp,
  requireMacSigningIdentity,
  verifyLinuxArtifacts,
  verifyMacSignature,
  verifyWindowsSignature,
} = require("./release/verify");
const { removeStaleMacSigningKeychains } = require("./release/macKeychain");
const { ensureRemoteFolder, publishPlatform } = require("./release/publisher");
const { createUploadIndicator } = require("./release/progress");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "dist");

function log(message) {
  console.log(message);
}

function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

function bumpPackageVersion(release) {
  const env = { ...process.env };
  delete env.ECHOCRAFT_SKIP_VERSION_BUMP;
  const result = spawnSync(
    process.execPath,
    [path.join(PROJECT_ROOT, "scripts", "bump-version.js"), release],
    { cwd: PROJECT_ROOT, env, stdio: "inherit" }
  );
  if (result.status !== 0) {
    throw new Error(`version bump failed with exit code ${result.status ?? 1}`);
  }
}

function runNpmBuild(config) {
  const env = prepareBuildEnv(config);
  if (config.id === "mac") {
    const stale = removeStaleMacSigningKeychains(PROJECT_ROOT);
    if (stale) {
      log(`Removed leftover electron-builder keychain: ${stale}`);
    }
    requireMacSigningIdentity();
    log("Signing with the login keychain (CSC_LINK is ignored on macOS)");
  }

  const result = spawnSync(
    "npm",
    ["run", config.npmScript, "--", ...config.builderArgs],
    { cwd: PROJECT_ROOT, env, stdio: "inherit" }
  );

  if (result.status !== 0) {
    throw new Error(`${config.npmScript} failed with exit code ${result.status ?? 1}`);
  }
}

function verifyPlatform(platformId, outputDir, artifacts) {
  if (platformId === "mac") {
    return verifyMacSignature(findMacApp(outputDir));
  }
  if (platformId === "win") {
    const installer =
      artifacts.find((name) => name.endsWith(".exe") && !name.includes("portable")) ??
      artifacts.find((name) => name.endsWith(".exe"));
    return verifyWindowsSignature(path.join(outputDir, installer));
  }
  return verifyLinuxArtifacts(artifacts.map((name) => path.join(outputDir, name)));
}

async function release(argv = process.argv, runtime = process) {
  const options = parseArgs(argv);
  const config = validateNativeHost(options.platformId, runtime);
  const env = loadReleaseEnv(PROJECT_ROOT);
  applyEnvToProcess(env);
  const uploadConfig = requireReleaseCredentials(options.platformId, {
    ...env,
    ...process.env,
  });

  const willBump = Boolean(options.bump) && !options.dryRun && !options.skipBuild;
  if (willBump) {
    bumpPackageVersion(options.bump);
  }

  const identity = readPackageIdentity(PROJECT_ROOT);

  log(`EchoCraft ${identity.version} ${options.platformId} release`);
  log(`  host:     ${runtime.platform}/${runtime.arch}`);
  log(`  bump:     ${willBump ? options.bump : "none"}`);
  log(`  dry-run:  ${options.dryRun}`);
  log(`  feed:     ${PUBLIC_SHARE_URL}`);

  if (!options.skipBuild) {
    log("Building signed artifacts...");
    runNpmBuild(config);
  }

  const fileNames = listOutputFiles(OUTPUT_DIR);
  const selected = selectReleaseArtifacts(fileNames, options.platformId);
  if (!selected.manifest) {
    throw new Error(`Missing ${config.manifest} in ${OUTPUT_DIR}`);
  }
  if (selected.artifacts.length === 0) {
    throw new Error(`No ${options.platformId} artifacts found in ${OUTPUT_DIR}`);
  }

  const manifest = parseUpdateYml(
    fs.readFileSync(path.join(OUTPUT_DIR, selected.manifest), "utf8")
  );
  const referenced = validateManifest({
    manifest,
    outputDir: OUTPUT_DIR,
    expectedVersion: identity.version,
    selectedArtifacts: selected.artifacts,
  });
  const plan = buildUploadPlan({
    artifacts: selected.artifacts,
    manifestName: selected.manifest,
    referencedUrls: referenced,
  });

  if (!options.skipVerify) {
    log("Verifying signatures and package identity...");
    verifyPlatform(options.platformId, OUTPUT_DIR, selected.artifacts);
  }

  log("Upload order:");
  for (const fileName of plan.order) {
    log(`  ${fileName}`);
  }

  if (options.skipUpload) {
    return { identity, plan, uploaded: false };
  }

  if (!options.dryRun) {
    await ensureRemoteFolder(uploadConfig);
  }

  const indicator = createUploadIndicator();
  const result = await publishPlatform({
    outputDir: OUTPUT_DIR,
    plan,
    uploadConfig,
    dryRun: options.dryRun,
    onFileStart: (event) => indicator.start(event),
    onProgress: (event) => indicator.progress(event),
  });

  log(
    options.dryRun
      ? "Dry run complete. No files were uploaded."
      : `Upload complete. ${result.uploaded.length} files published.`
  );
  log(`Public location: ${PUBLIC_SHARE_URL}`);
  return { identity, plan, result };
}

if (require.main === module) {
  release().catch((error) => {
    fail(error.message);
  });
}

module.exports = { release };
