#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { PUBLIC_SHARE_URL, PLATFORMS } = require("./release/constants");
const {
  applyEnvToProcess,
  loadUploadEnv,
  requireUploadCredentials,
} = require("./release/env");
const {
  buildUploadPlan,
  discoverUploadablePlatforms,
  listOutputFiles,
  parseUpdateYml,
  readPackageIdentity,
  validateManifest,
} = require("./release/artifacts");
const { ensureRemoteFolder, publishPlatform } = require("./release/publisher");
const { createUploadIndicator } = require("./release/progress");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "dist");

const PLATFORM_LABELS = {
  mac: "macOS",
  win: "Windows",
  linux: "Linux",
};

function log(message) {
  console.log(message);
}

function fail(message) {
  console.error(`upload: ${message}`);
  process.exit(1);
}

function parseUploadArgs(argv) {
  const args = argv.slice(2);
  let dryRun = false;
  for (const arg of args) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      throw new Error("Usage: ./upload.sh or .\\upload.ps1 [--dry-run]");
    }
  }
  return { dryRun };
}

function formatStatusLine(entry) {
  const label = PLATFORM_LABELS[entry.id].padEnd(8);
  if (entry.status === "ready") {
    const count = entry.selected.artifacts.length;
    return `${label} ready     ${entry.selected.manifest} + ${count} file(s)`;
  }
  if (entry.status === "incomplete") {
    return `${label} skipped   ${entry.reason}`;
  }
  return `${label} missing   ${entry.reason}`;
}

function planPlatformUpload(entry, outputDir, expectedVersion) {
  const manifest = parseUpdateYml(
    fs.readFileSync(path.join(outputDir, entry.selected.manifest), "utf8")
  );
  const referenced = validateManifest({
    manifest,
    outputDir,
    expectedVersion,
    selectedArtifacts: entry.selected.artifacts,
  });
  return buildUploadPlan({
    artifacts: entry.selected.artifacts,
    manifestName: entry.selected.manifest,
    referencedUrls: referenced,
  });
}

async function uploadAvailable(argv = process.argv) {
  const options = parseUploadArgs(argv);
  const env = loadUploadEnv(PROJECT_ROOT);
  applyEnvToProcess(env);
  const uploadConfig = requireUploadCredentials(env);
  const identity = readPackageIdentity(PROJECT_ROOT);
  const discoveries = discoverUploadablePlatforms(listOutputFiles(OUTPUT_DIR));
  const ready = discoveries.filter((entry) => entry.status === "ready");

  log(`EchoCraft ${identity.version} upload`);
  log(`  env:      .env.upload`);
  log(`  nc:       ${uploadConfig.ncUser}@${uploadConfig.ncUrl}`);
  log(`  folder:   ${uploadConfig.remoteFolder}`);
  log(`  dry-run:  ${options.dryRun}`);
  log(`  feed:     ${PUBLIC_SHARE_URL}`);
  log("");
  for (const entry of discoveries) {
    log(`  ${formatStatusLine(entry)}`);
  }

  if (ready.length === 0) {
    throw new Error("nothing to upload: dist/ has no complete macOS, Windows, or Linux release");
  }

  const plans = ready.map((entry) => ({
    entry,
    plan: planPlatformUpload(entry, OUTPUT_DIR, identity.version),
  }));

  if (!options.dryRun) {
    await ensureRemoteFolder(uploadConfig);
  }

  const published = [];
  for (const { entry, plan } of plans) {
    log("");
    log(`Uploading ${PLATFORM_LABELS[entry.id]} (${PLATFORMS[entry.id].manifest} last):`);
    for (const fileName of plan.order) {
      log(`  ${fileName}`);
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
    published.push({
      id: entry.id,
      files: result.uploaded.length,
    });
  }

  log("");
  log(
    options.dryRun
      ? `Dry run complete. ${published.length} platform(s) would be uploaded.`
      : `Upload complete. ${published.length} platform(s) published.`
  );
  log(`Public location: ${PUBLIC_SHARE_URL}`);
  return { identity, discoveries, published };
}

if (require.main === module) {
  uploadAvailable().catch((error) => {
    fail(error.message);
  });
}

module.exports = {
  parseUploadArgs,
  formatStatusLine,
  uploadAvailable,
};
