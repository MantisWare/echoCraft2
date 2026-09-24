const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_RETRIES = 5;
const DEFAULT_RETRY_BACKOFF_MS = 1_500;
const DEFAULT_BUSY_BACKOFF_MS = 45_000;
const DEFAULT_FINAL_RETRY_DELAY_MS = 20_000;

function normalizeRemotePath(remotePath) {
  return String(remotePath ?? "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function remoteDirFor(remotePath, relativeFile) {
  const root = normalizeRemotePath(remotePath);
  const parent = path.posix.dirname(relativeFile);
  const parts = [];
  if (root) {
    parts.push(root);
  }
  if (parent !== "." && parent !== "/") {
    parts.push(parent);
  }
  return parts.join("/") || null;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isConnectionCapError(message) {
  return /\b421\b/.test(message) || /too many connections/i.test(message);
}

function isBusyError(message) {
  return isConnectionCapError(message) || /timeout/i.test(message);
}

function defaultSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

async function defaultCreateClient(ftpConfig) {
  const { Client } = require("basic-ftp");
  const client = new Client(ftpConfig?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  client.ftp.ipFamily = 4;
  return client;
}

function splitRemoteDir(dir) {
  return String(dir ?? "")
    .split("/")
    .filter(Boolean);
}

async function enterRemoteDir(client, targetDir, currentDir) {
  if (!targetDir) {
    return currentDir ?? null;
  }
  const from = splitRemoteDir(currentDir);
  const to = splitRemoteDir(targetDir);
  if (from.join("/") === to.join("/")) {
    return targetDir;
  }

  let common = 0;
  while (common < from.length && common < to.length && from[common] === to[common]) {
    common += 1;
  }
  for (let i = 0; i < from.length - common; i += 1) {
    await client.cd("..");
  }
  for (let i = common; i < to.length; i += 1) {
    await client.ensureDir(to[i]);
  }
  return targetDir;
}

async function closeQuietly(client) {
  if (client && typeof client.close === "function") {
    try {
      await client.close();
    } catch {
      // The control socket may already be dead.
    }
  }
}

async function publishWebsite({
  websiteDir,
  files,
  ftpConfig,
  dryRun = false,
  createClient = defaultCreateClient,
  sleep = defaultSleep,
} = {}) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error("website upload is missing files");
  }
  if (!ftpConfig?.user || !ftpConfig.password) {
    throw new Error("FTP credentials are required to publish the website");
  }

  if (dryRun) {
    return {
      uploaded: [...files],
      skipped: [...files],
      dryRun: true,
    };
  }

  const retries = Math.max(1, Number(ftpConfig.retries) || DEFAULT_RETRIES);
  const retryBackoffMs = Number(ftpConfig.retryBackoffMs) || DEFAULT_RETRY_BACKOFF_MS;
  const busyBackoffMs = Number(ftpConfig.busyBackoffMs) || DEFAULT_BUSY_BACKOFF_MS;
  const finalRetryDelayMs =
    Number(ftpConfig.finalRetryDelayMs) || DEFAULT_FINAL_RETRY_DELAY_MS;

  let client = null;
  let currentDir = null;

  const dropSession = async () => {
    await closeQuietly(client);
    client = null;
    currentDir = null;
  };

  const session = async () => {
    if (client) {
      return client;
    }
    const next = await createClient(ftpConfig);
    await next.access({
      host: ftpConfig.host,
      port: ftpConfig.port,
      user: ftpConfig.user,
      password: ftpConfig.password,
      secure: ftpConfig.secure === true,
    });
    client = next;
    currentDir = null;
    return next;
  };

  const uploaded = [];
  const skipped = [];

  const transferFile = async (relativeFile) => {
    const localPath = path.join(websiteDir, relativeFile);
    const localSize = fs.statSync(localPath).size;
    const targetDir = remoteDirFor(ftpConfig.remotePath, relativeFile);
    const remoteName = path.posix.basename(relativeFile);

    let lastError = null;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        const ftp = await session();
        currentDir = await enterRemoteDir(ftp, targetDir, currentDir);

        let remoteSize = null;
        try {
          remoteSize = await ftp.size(remoteName);
        } catch {
          remoteSize = null;
        }

        if (remoteSize === localSize) {
          skipped.push(relativeFile);
          console.log(`  skipped ${relativeFile}`);
          return { ok: true };
        }

        await ftp.uploadFrom(localPath, remoteName);
        const verified = await ftp.size(remoteName);
        if (verified !== localSize) {
          throw new Error(
            `incomplete upload: server has ${verified} of ${localSize} bytes`
          );
        }
        uploaded.push(relativeFile);
        console.log(`  uploaded ${relativeFile}`);
        return { ok: true };
      } catch (error) {
        lastError = error;
        const message = errorMessage(error);
        await dropSession();
        if (attempt >= retries) {
          break;
        }
        const busy = isBusyError(message);
        const backoffMs = busy ? busyBackoffMs : retryBackoffMs * attempt;
        const waitNote = busy
          ? ` — waiting ${Math.round(backoffMs / 1000)}s for the server to free connections`
          : "";
        console.log(
          `  retry ${attempt + 1}/${retries} after error: ${message}${waitNote}`
        );
        await sleep(backoffMs);
      }
    }
    return { ok: false, error: lastError };
  };

  try {
    const failed = [];
    for (const relativeFile of files) {
      const result = await transferFile(relativeFile);
      if (!result.ok) {
        failed.push({ relativeFile, error: result.error });
      }
    }

    if (failed.length > 0) {
      console.log(
        `  waiting ${Math.round(finalRetryDelayMs / 1000)}s before retrying ${failed.length} failed file(s)`
      );
      await dropSession();
      await sleep(finalRetryDelayMs);
      const stillFailed = [];
      for (const item of failed) {
        const result = await transferFile(item.relativeFile);
        if (!result.ok) {
          stillFailed.push({
            relativeFile: item.relativeFile,
            error: result.error ?? item.error,
          });
        }
      }
      if (stillFailed.length > 0) {
        const first = stillFailed[0];
        throw new Error(
          `Website upload failed for ${first.relativeFile}: ${errorMessage(first.error)}`
        );
      }
    }
  } finally {
    await dropSession();
  }

  return { uploaded, skipped, dryRun: false };
}

module.exports = {
  publishWebsite,
  remoteDirFor,
  enterRemoteDir,
  normalizeRemotePath,
  isConnectionCapError,
};
