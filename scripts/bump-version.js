#!/usr/bin/env node
//
// Bumps the app version ahead of a build. macOS is the release platform, so
// its build scripts run this; Windows and Linux builds reuse whatever version
// macOS last produced, which keeps one build number across all three.
//
// Deliberately not `npm version`: that rewrites package-lock.json through the
// installer, and the lockfile must only ever be regenerated under the Node
// version pinned in .nvmrc (see CLAUDE.md). Here the version fields are the
// only thing touched, so the dependency tree cannot drift.
//
// Usage:
//   node scripts/bump-version.js                # patch bump
//   node scripts/bump-version.js minor          # or major, or an explicit X.Y.Z
//   node scripts/bump-version.js --dry-run      # print the result, write nothing
//
// Set ECHOCRAFT_SKIP_VERSION_BUMP=1 to make this a no-op, which is how a
// caller that already bumped avoids a double bump.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PACKAGE_PATH = path.join(ROOT, "package.json");
const LOCKFILE_PATH = path.join(ROOT, "package-lock.json");

const RELEASE_TYPES = new Set(["major", "minor", "patch"]);
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const MIN_RELEASE_VERSION = "2.0.1";

function parseArgs(argv) {
  const args = argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const positional = args.filter((arg) => !arg.startsWith("-"));

  if (positional.length > 1) {
    throw new Error(`expected at most one release type, got: ${positional.join(", ")}`);
  }

  const release = positional[0] ?? "patch";
  if (!RELEASE_TYPES.has(release) && !SEMVER_RE.test(release)) {
    throw new Error(`release must be major, minor, patch, or an explicit X.Y.Z — got "${release}"`);
  }

  return { release, dryRun };
}

function compareSemver(left, right) {
  const a = SEMVER_RE.exec(left);
  const b = SEMVER_RE.exec(right);
  if (a === null || b === null) return null;
  for (let index = 1; index <= 3; index += 1) {
    const delta = Number(a[index]) - Number(b[index]);
    if (delta !== 0) return delta < 0 ? -1 : 1;
  }
  return 0;
}

function nextVersion(current, release) {
  let next;
  if (SEMVER_RE.test(release)) {
    next = release;
  } else {
    const match = SEMVER_RE.exec(current);
    if (match === null) {
      throw new Error(`package.json version "${current}" is not a plain X.Y.Z semver`);
    }

    const [major, minor, patch] = match.slice(1).map(Number);
    if (release === "major") next = `${major + 1}.0.0`;
    else if (release === "minor") next = `${major}.${minor + 1}.0`;
    else next = `${major}.${minor}.${patch + 1}`;
  }

  if ((compareSemver(next, MIN_RELEASE_VERSION) ?? -1) < 0) {
    return MIN_RELEASE_VERSION;
  }
  return next;
}

// Rewrites only the top-level "version" string, so the file keeps its existing
// indentation and its lack of a trailing newline.
function writePackageVersion(version) {
  const raw = fs.readFileSync(PACKAGE_PATH, "utf8");
  const updated = raw.replace(/^(\s*"version":\s*")[^"]*(")/m, `$1${version}$2`);
  if (updated === raw) {
    throw new Error('could not find a top-level "version" field in package.json');
  }
  fs.writeFileSync(PACKAGE_PATH, updated);
}

// npm resolves the root package from both the top-level fields and the ""
// entry in `packages`, and `npm ci` refuses to run when either disagrees with
// package.json. Keep the name in sync too: the fork rename left the lockfile
// behind, and only rewriting the version would preserve that break.
function writeLockfileIdentity(name, version) {
  if (!fs.existsSync(LOCKFILE_PATH)) return false;

  const lockfile = JSON.parse(fs.readFileSync(LOCKFILE_PATH, "utf8"));
  lockfile.name = name;
  lockfile.version = version;

  const root = lockfile.packages?.[""];
  if (root !== undefined) {
    root.name = name;
    root.version = version;
  }

  fs.writeFileSync(LOCKFILE_PATH, `${JSON.stringify(lockfile, null, 2)}\n`);
  return true;
}

function main() {
  if (process.env.ECHOCRAFT_SKIP_VERSION_BUMP === "1") {
    console.log("version bump skipped (ECHOCRAFT_SKIP_VERSION_BUMP=1)");
    return;
  }

  const { release, dryRun } = parseArgs(process.argv);
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, "utf8"));
  const current = pkg.version;
  const next = nextVersion(current, release);

  if (dryRun) {
    console.log(`${current} -> ${next} (dry run, nothing written)`);
    return;
  }

  writePackageVersion(next);
  const lockfileUpdated = writeLockfileIdentity(pkg.name, next);

  console.log(`version ${current} -> ${next}${lockfileUpdated ? " (package-lock.json synced)" : ""}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`bump-version: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  MIN_RELEASE_VERSION,
  compareSemver,
  nextVersion,
};
