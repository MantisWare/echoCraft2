const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_FTP_HOST = "mantisware.co.za";
const DEFAULT_FTP_PORT = 21;
const DEFAULT_FTP_PATH = "/echoCraft";
const WEBSITE_PUBLIC_BASE = "https://www.mantisware.co.za/echoCraft/";

const ALLOWED_EXTENSIONS = new Set([
  ".html",
  ".css",
  ".js",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
]);

const SKIP_NAMES = new Set(["README.md", "SUMMARY.md", ".DS_Store"]);

function firstNonEmpty(env, keys, fallback) {
  for (const key of keys) {
    const value = env[key];
    if (value !== undefined && value !== "") {
      return value;
    }
  }
  return fallback;
}

function getFtpConfig(env = {}) {
  return {
    host: firstNonEmpty(env, ["FTP_HOST", "SFTP_HOST"], DEFAULT_FTP_HOST),
    port: Number(firstNonEmpty(env, ["FTP_PORT", "SFTP_PORT"], String(DEFAULT_FTP_PORT))),
    user: firstNonEmpty(env, ["FTP_USER", "SFTP_USER"], ""),
    password: firstNonEmpty(env, ["FTP_PASSWORD", "SFTP_PASSWORD"], ""),
    remotePath: firstNonEmpty(env, ["FTP_PATH", "SFTP_PATH"], DEFAULT_FTP_PATH),
    secure: firstNonEmpty(env, ["FTP_SECURE"], "false") === "true",
    timeoutMs: Number(firstNonEmpty(env, ["FTP_TIMEOUT_MS"], "60000")),
    retries: Number(firstNonEmpty(env, ["FTP_RETRIES"], "5")),
    retryBackoffMs: Number(firstNonEmpty(env, ["FTP_RETRY_BACKOFF_MS"], "1500")),
    busyBackoffMs: Number(firstNonEmpty(env, ["FTP_BUSY_BACKOFF_MS"], "45000")),
    finalRetryDelayMs: Number(firstNonEmpty(env, ["FTP_FINAL_RETRY_DELAY_MS"], "20000")),
  };
}

function requireFtpCredentials(config) {
  if (!config.user) {
    throw new Error("FTP_USER is not set. Add FTP_USER (or SFTP_USER) to .env.upload.");
  }
  if (!config.password) {
    throw new Error(
      "FTP_PASSWORD is not set. Add FTP_PASSWORD (or SFTP_PASSWORD) to .env.upload."
    );
  }
  if (!Number.isFinite(config.port) || config.port <= 0) {
    throw new Error(`FTP_PORT is invalid: ${config.port}`);
  }
  return config;
}

function listWebsiteFiles(websiteDir) {
  if (!fs.existsSync(websiteDir) || !fs.statSync(websiteDir).isDirectory()) {
    throw new Error(`Missing docs/webpage. Expected website files at ${websiteDir}`);
  }

  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_NAMES.has(entry.name) || entry.name.startsWith(".")) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const extension = path.extname(entry.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(extension)) {
        continue;
      }
      files.push(path.relative(websiteDir, fullPath).split(path.sep).join("/"));
    }
  };

  walk(websiteDir);
  files.sort();
  if (files.length === 0) {
    throw new Error("no deployable website files in docs/webpage");
  }
  return files;
}

function websiteDirFromRoot(projectRoot) {
  return path.join(projectRoot, "docs", "webpage");
}

module.exports = {
  DEFAULT_FTP_HOST,
  DEFAULT_FTP_PORT,
  DEFAULT_FTP_PATH,
  WEBSITE_PUBLIC_BASE,
  ALLOWED_EXTENSIONS,
  getFtpConfig,
  requireFtpCredentials,
  listWebsiteFiles,
  websiteDirFromRoot,
};
