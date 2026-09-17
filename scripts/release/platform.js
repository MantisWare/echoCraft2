const { PLATFORMS } = require("./constants");

function getPlatformConfig(platformId) {
  const config = PLATFORMS[platformId];
  if (!config) {
    throw new Error(
      `Unknown release platform "${platformId}". Use mac, win, or linux.`
    );
  }
  return config;
}

function validateNativeHost(platformId, { platform, arch } = process) {
  const config = getPlatformConfig(platformId);
  if (platform !== config.host) {
    throw new Error(
      `${platformId} releases must run on ${config.host}; this host is ${platform}`
    );
  }
  if (arch !== config.arch) {
    throw new Error(
      `${platformId} releases support ${config.arch} only; this host is ${arch}`
    );
  }
  return config;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {
    dryRun: false,
    skipBuild: false,
    skipVerify: false,
    skipUpload: false,
    bump: undefined,
  };
  const positional = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--skip-build") flags.skipBuild = true;
    else if (arg === "--skip-verify") flags.skipVerify = true;
    else if (arg === "--skip-upload") flags.skipUpload = true;
    else if (arg === "--no-bump") flags.bump = null;
    else if (arg === "--bump") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        throw new Error("--bump needs patch, minor, major, or an explicit X.Y.Z");
      }
      flags.bump = value;
      index += 1;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (positional.length !== 1) {
    throw new Error(
      "Usage: node scripts/release.js <mac|win|linux> [--bump patch|minor|major|X.Y.Z] [--no-bump] [--dry-run] [--skip-build]"
    );
  }

  const platformId = positional[0];
  if (platformId === "mac") {
    if (flags.bump === undefined) flags.bump = "patch";
  } else if (flags.bump) {
    throw new Error(
      "version bump is macOS-only; Windows and Linux reuse the version macOS last released"
    );
  } else {
    flags.bump = null;
  }

  return { platformId, ...flags };
}

module.exports = {
  getPlatformConfig,
  validateNativeHost,
  parseArgs,
};
