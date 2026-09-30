#!/usr/bin/env node

const path = require("node:path");
const { readPackageIdentity } = require("./release/artifacts");
const { applyEnvToProcess, loadUploadEnv } = require("./release/env");
const {
  getFtpConfig,
  listWebsiteFiles,
  requireFtpCredentials,
  websiteDirFromRoot,
  WEBSITE_PUBLIC_BASE,
} = require("./release/website");
const { publishWebsite } = require("./release/websitePublisher");

const PROJECT_ROOT = path.resolve(__dirname, "..");

function logDefault(message) {
  console.log(message);
}

function fail(message) {
  console.error(`upload-web: ${message}`);
  process.exit(1);
}

function parseWebArgs(argv) {
  const args = argv.slice(2);
  let dryRun = false;
  for (const arg of args) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      throw new Error("Usage: ./upload-web.sh or .\\upload-web.ps1 [--dry-run]");
    }
  }
  return { dryRun };
}

async function uploadWebsiteOnly({
  argv = process.argv,
  projectRoot = PROJECT_ROOT,
  loadEnv = loadUploadEnv,
  applyEnv = applyEnvToProcess,
  publish = publishWebsite,
  log = logDefault,
} = {}) {
  const options = parseWebArgs(argv);
  const env = loadEnv(projectRoot);
  applyEnv(env);
  const ftpConfig = requireFtpCredentials(getFtpConfig(env));
  const websiteDir = websiteDirFromRoot(projectRoot);
  const websiteFiles = listWebsiteFiles(websiteDir);
  const identity = readPackageIdentity(projectRoot);

  log(`EchoCraft ${identity.version} website upload`);
  log(`  env:      .env.upload`);
  log(`  site:     ${ftpConfig.host}:${ftpConfig.port}${ftpConfig.remotePath}`);
  log(`  public:   ${WEBSITE_PUBLIC_BASE}`);
  log(`  dry-run:  ${options.dryRun}`);
  log("");
  log(`Uploading website (${websiteFiles.length} file(s)):`);
  for (const fileName of websiteFiles) {
    log(`  ${fileName}`);
  }

  const websiteResult = await publish({
    websiteDir,
    files: websiteFiles,
    ftpConfig,
    dryRun: options.dryRun,
  });

  log("");
  log(
    options.dryRun
      ? `Dry run complete. ${websiteResult.uploaded.length} website file(s) would be uploaded.`
      : `Upload complete. ${websiteResult.uploaded.length} website file(s) uploaded, ${websiteResult.skipped.length} unchanged.`
  );
  log(`Website: ${WEBSITE_PUBLIC_BASE}`);
  return { identity, website: websiteResult };
}

if (require.main === module) {
  uploadWebsiteOnly().catch((error) => {
    fail(error.message);
  });
}

module.exports = {
  parseWebArgs,
  uploadWebsiteOnly,
};
