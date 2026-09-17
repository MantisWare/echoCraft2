const fs = require("node:fs");
const path = require("node:path");
const {
  DEFAULT_NC_URL,
  DEFAULT_NC_USER,
  DEFAULT_REMOTE_FOLDER,
} = require("./constants");

const ENV_FILES = [".env.signing", ".env.upload", ".env.release"];
const UPLOAD_ENV_FILE = ".env.upload";

function parseEnvFile(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = line.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function assignNonEmpty(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== "") {
      target[key] = value;
    }
  }
  return target;
}

function loadReleaseEnv(projectRoot, env = process.env) {
  const loaded = {};
  for (const fileName of ENV_FILES) {
    const filePath = path.join(projectRoot, fileName);
    if (!fs.existsSync(filePath)) continue;
    assignNonEmpty(loaded, parseEnvFile(fs.readFileSync(filePath, "utf8")));
  }

  return assignNonEmpty({ ...loaded }, env);
}

function loadUploadEnv(projectRoot, env = process.env) {
  const filePath = path.join(projectRoot, UPLOAD_ENV_FILE);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Missing ${UPLOAD_ENV_FILE}. Add NC_URL, NC_USER, NC_PASSWORD, and REMOTE_FOLDER.`
    );
  }
  const loaded = parseEnvFile(fs.readFileSync(filePath, "utf8"));
  return assignNonEmpty({ ...loaded }, env);
}

function getUploadConfig(env) {
  return {
    ncUrl: env.NC_URL ?? DEFAULT_NC_URL,
    ncUser: env.NC_USER ?? DEFAULT_NC_USER,
    ncPassword: env.NC_PASSWORD ?? "",
    remoteFolder: env.REMOTE_FOLDER ?? DEFAULT_REMOTE_FOLDER,
  };
}

function hasAppleApiKey(env) {
  return Boolean(env.APPLE_API_KEY_ID && env.APPLE_API_KEY && env.APPLE_API_ISSUER);
}

function hasAppleId(env) {
  return Boolean(
    env.APPLE_ID && (env.APPLE_APP_SPECIFIC_PASSWORD ?? env.APPLE_PASSWORD)
  );
}

function requireReleaseCredentials(platformId, env) {
  const missing = [];
  const upload = getUploadConfig(env);
  if (!upload.ncPassword) missing.push("NC_PASSWORD");

  if (platformId === "mac") {
    if (!env.CSC_LINK && !env.CSC_NAME) {
      // Keychain auto-discovery is allowed, but CSC_KEY_PASSWORD is still
      // required when a .p12 is supplied.
    }
    if (env.CSC_LINK && !env.CSC_KEY_PASSWORD) missing.push("CSC_KEY_PASSWORD");
    if (!hasAppleApiKey(env) && !hasAppleId(env)) {
      missing.push("APPLE_API_KEY_ID/APPLE_API_KEY/APPLE_API_ISSUER or APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD");
    }
  }

  if (platformId === "win") {
    if (!env.CSC_LINK && !env.WIN_CSC_LINK) missing.push("CSC_LINK");
    if (!env.CSC_KEY_PASSWORD && !env.WIN_CSC_KEY_PASSWORD) {
      missing.push("CSC_KEY_PASSWORD");
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing release credentials for ${platformId}: ${missing.join(", ")}`
    );
  }

  return upload;
}

function requireUploadCredentials(env) {
  const upload = getUploadConfig(env);
  const missing = [];
  if (!env.NC_URL && !upload.ncUrl) missing.push("NC_URL");
  if (!env.NC_USER && !upload.ncUser) missing.push("NC_USER");
  if (!upload.ncPassword) missing.push("NC_PASSWORD");
  if (!env.REMOTE_FOLDER && !upload.remoteFolder) missing.push("REMOTE_FOLDER");
  if (missing.length > 0) {
    throw new Error(`Missing upload credentials in ${UPLOAD_ENV_FILE}: ${missing.join(", ")}`);
  }
  return upload;
}

function applyEnvToProcess(env, target = process.env) {
  for (const [key, value] of Object.entries(env)) {
    if (target[key] === undefined || target[key] === "") {
      target[key] = value;
    }
  }
}

// electron-builder 26.15.3 (#10066) creates a temp keychain with a random
// password when CSC_LINK is set, then unlocks it with CSC_KEY_PASSWORD.
// Local macOS releases sign with the Developer ID already in the login keychain.
function prepareBuildEnv(config, env = process.env) {
  const next = {
    ...env,
    CSC_IDENTITY_AUTO_DISCOVERY: "true",
  };
  if (config.skipVersionBump || config.id === "mac") {
    next.ECHOCRAFT_SKIP_VERSION_BUMP = "1";
  }
  if (config.id === "mac") {
    delete next.CSC_LINK;
    delete next.WIN_CSC_LINK;
  }
  return next;
}

module.exports = {
  ENV_FILES,
  UPLOAD_ENV_FILE,
  parseEnvFile,
  loadReleaseEnv,
  loadUploadEnv,
  getUploadConfig,
  requireReleaseCredentials,
  requireUploadCredentials,
  applyEnvToProcess,
  prepareBuildEnv,
  hasAppleApiKey,
  hasAppleId,
};
