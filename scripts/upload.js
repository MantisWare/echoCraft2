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
const {
  getFtpConfig,
  listWebsiteFiles,
  requireFtpCredentials,
  websiteDirFromRoot,
  WEBSITE_PUBLIC_BASE,
} = require("./release/website");
const { publishWebsite } = require("./release/websitePublisher");

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

function resolveUploadWork({ platforms = [], websiteFiles = [] } = {}) {
  if (platforms.length === 0 && websiteFiles.length === 0) {
    throw new Error(
      "nothing to upload: dist/ has no complete platform release and docs/webpage has no deployable files"
    );
  }
  return { platforms, websiteFiles };
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

function listDistFiles(outputDir) {
  if (!fs.existsSync(outputDir)) {
    return [];
  }
  return listOutputFiles(outputDir);
}

async function uploadAvailable(argv = process.argv) {
  const options = parseUploadArgs(argv);
  const env = loadUploadEnv(PROJECT_ROOT);
  applyEnvToProcess(env);
  const ftpConfig = requireFtpCredentials(getFtpConfig(env));
  const websiteDir = websiteDirFromRoot(PROJECT_ROOT);
  const websiteFiles = listWebsiteFiles(websiteDir);
  const identity = readPackageIdentity(PROJECT_ROOT);
  const discoveries = discoverUploadablePlatforms(listDistFiles(OUTPUT_DIR));
  const ready = discoveries.filter((entry) => entry.status === "ready");
  const work = resolveUploadWork({ platforms: ready, websiteFiles });
  const uploadConfig = work.platforms.length > 0 ? requireUploadCredentials(env) : null;

  log(`EchoCraft ${identity.version} upload`);
  log(`  env:      .env.upload`);
  if (uploadConfig) {
    log(`  nc:       ${uploadConfig.ncUser}@${uploadConfig.ncUrl}`);
    log(`  folder:   ${uploadConfig.remoteFolder}`);
    log(`  feed:     ${PUBLIC_SHARE_URL}`);
  }
  log(`  site:     ${ftpConfig.host}:${ftpConfig.port}${ftpConfig.remotePath}`);
  log(`  public:   ${WEBSITE_PUBLIC_BASE}`);
  log(`  dry-run:  ${options.dryRun}`);
  log("");
  for (const entry of discoveries) {
    log(`  ${formatStatusLine(entry)}`);
  }
  log(`  Website  ready     ${work.websiteFiles.length} file(s)`);

  const published = [];
  if (work.platforms.length > 0) {
    const plans = work.platforms.map((entry) => ({
      entry,
      plan: planPlatformUpload(entry, OUTPUT_DIR, identity.version),
    }));

    if (!options.dryRun) {
      await ensureRemoteFolder(uploadConfig);
    }

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
  }

  log("");
  log(`Uploading website (${work.websiteFiles.length} file(s)):`);
  for (const fileName of work.websiteFiles) {
    log(`  ${fileName}`);
  }
  const websiteResult = await publishWebsite({
    websiteDir,
    files: work.websiteFiles,
    ftpConfig,
    dryRun: options.dryRun,
  });

  log("");
  log(
    options.dryRun
      ? `Dry run complete. ${published.length} platform(s) and ${websiteResult.uploaded.length} website file(s) would be uploaded.`
      : `Upload complete. ${published.length} platform(s) published, ${websiteResult.uploaded.length} website file(s) uploaded, ${websiteResult.skipped.length} unchanged.`
  );
  if (uploadConfig) {
    log(`Public location: ${PUBLIC_SHARE_URL}`);
  }
  log(`Website: ${WEBSITE_PUBLIC_BASE}`);
  return { identity, discoveries, published, website: websiteResult };
}

if (require.main === module) {
  uploadAvailable().catch((error) => {
    fail(error.message);
  });
}

module.exports = {
  parseUploadArgs,
  formatStatusLine,
  resolveUploadWork,
  uploadAvailable,
};
