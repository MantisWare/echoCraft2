const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs/promises");
const debugLogger = require("./debugLogger");
const { deriveAppIdentity } = require("./micCapturePolicy");

const execFileAsync = promisify(execFile);

const EXEC_OPTS = { timeout: 3000, encoding: "utf8", windowsHide: true };
// A PID's executable cannot change, so a resolution is good for the process
// lifetime. The cap only guards against a pathological churn of short-lived
// capture processes.
const MAX_CACHE_ENTRIES = 256;

const cache = new Map();

const unresolved = (pid) => ({ pid, executablePath: null, appId: null, appName: null });

const remember = (pid, identity) => {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(pid, identity);
  return identity;
};

// `comm` is a full path on macOS and a bare (15-char truncated) name on Linux,
// which is why Linux prefers /proc.
const readExecutablePathUnix = async (pid) => {
  const { stdout } = await execFileAsync("ps", ["-p", String(pid), "-o", "comm="], EXEC_OPTS);
  const executablePath = stdout.trim();
  return executablePath === "" ? null : executablePath;
};

const readExecutablePathLinux = async (pid) => {
  try {
    return await fs.readlink(`/proc/${pid}/exe`);
  } catch {
    return readExecutablePathUnix(pid);
  }
};

const readExecutablePathWin32 = async (pid) => {
  const processListCache = require("./processListCache");
  const entries = await processListCache.getProcessEntries();
  const entry = entries.find(({ pid: entryPid }) => entryPid === pid);
  return entry?.cmd?.trim() || entry?.name?.trim() || null;
};

const readExecutablePath = (pid) => {
  switch (process.platform) {
    case "linux":
      return readExecutablePathLinux(pid);
    case "win32":
      return readExecutablePathWin32(pid);
    default:
      return readExecutablePathUnix(pid);
  }
};

/**
 * Resolves the app behind a capturing PID.
 *
 * Never rejects: an unresolvable PID comes back with a null `appId`, which the
 * policy treats as unattributed rather than as a reason to stop detecting.
 */
async function resolveCaptureIdentity(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return unresolved(pid);

  const cached = cache.get(pid);
  if (cached) return cached;

  try {
    const executablePath = await readExecutablePath(pid);
    if (!executablePath) return remember(pid, unresolved(pid));

    const { appId, appName } = deriveAppIdentity(executablePath);
    return remember(pid, { pid, executablePath, appId, appName });
  } catch (error) {
    debugLogger.debug(
      "Failed to attribute a capturing pid",
      { pid, error: error?.message },
      "meeting"
    );
    return remember(pid, unresolved(pid));
  }
}

function clearCaptureIdentityCache() {
  cache.clear();
}

module.exports = { resolveCaptureIdentity, clearCaptureIdentityCache };
