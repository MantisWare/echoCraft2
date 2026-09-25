#!/usr/bin/env node
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  copyLibraries,
  downloadFile,
  extractArchive,
  fetchLatestRelease,
  findBinaryInDir,
  parseArgs,
  formatUnsupportedPlatformError,
  setExecutable,
  cleanupFiles,
} = require("./lib/download-utils");

const LLAMA_CPP_REPO = "ggml-org/llama.cpp";

// Pinned to a tested build that loads current GGUF models. whisper-server is
// statically linked, so bumping this can't affect local Whisper.
const LLAMA_CPP_TAG = process.env.LLAMA_CPP_VERSION || "b9763";

const BINARIES = {
  "darwin-arm64": {
    platformArch: "darwin-arm64",
    assetPattern: /^llama-.*-bin-macos-arm64\.tar\.gz$/,
    binaryPath: "build/bin/llama-server",
    outputName: "llama-server-darwin-arm64",
    libPattern: "*.dylib",
    // arm64 and x64 archives ship the same dylib names. A shared folder lets the
    // later download overwrite the earlier one, so the arm64 server loads x86_64 libs.
    libDir: "llama-libs/darwin-arm64",
  },
  "darwin-x64": {
    platformArch: "darwin-x64",
    assetPattern: /^llama-.*-bin-macos-x64\.tar\.gz$/,
    binaryPath: "build/bin/llama-server",
    outputName: "llama-server-darwin-x64",
    libPattern: "*.dylib",
    libDir: "llama-libs/darwin-x64",
  },
  "win32-x64-cpu": {
    platformArch: "win32-x64",
    assetPattern: /^llama-.*-bin-win-cpu-x64\.zip$/,
    binaryPath: "build/bin/llama-server.exe",
    outputName: "llama-server-win32-x64-cpu.exe",
    libPattern: "*.dll",
  },
  "linux-x64-cpu": {
    platformArch: "linux-x64",
    assetPattern: /^llama-.*-bin-ubuntu-x64\.tar\.gz$/,
    binaryPath: "build/bin/llama-server",
    outputName: "llama-server-linux-x64-cpu",
    libPattern: "*.so*",
  },
};

const BIN_DIR = path.join(__dirname, "..", "resources", "bin");
const DARWIN_IMPL_LIB = "libllama-server-impl.dylib";

function libraryDirFor(binDir, config) {
  if (!config.libDir) return binDir;
  return path.join(binDir, config.libDir);
}

function loaderRpath(config) {
  if (!config.libDir) return null;
  return `@loader_path/${config.libDir}`;
}

function binaryHasRpath(binaryPath, rpath) {
  try {
    const listed = execFileSync("otool", ["-l", binaryPath], { encoding: "utf8" });
    return listed.includes(`path ${rpath} (`);
  } catch {
    return false;
  }
}

function ensureLoaderRpath(binaryPath, rpath) {
  if (!rpath || process.platform !== "darwin") return;
  if (binaryHasRpath(binaryPath, rpath)) return;
  execFileSync("install_name_tool", ["-add_rpath", rpath, binaryPath]);
}

function isCompleteInstall(binDir, config) {
  const binaryPath = path.join(binDir, config.outputName);
  if (!fs.existsSync(binaryPath)) return false;
  if (!config.libDir) return true;
  const implPath = path.join(libraryDirFor(binDir, config), DARWIN_IMPL_LIB);
  if (!fs.existsSync(implPath)) return false;
  const rpath = loaderRpath(config);
  return !rpath || binaryHasRpath(binaryPath, rpath);
}

function removeFlatLibraries(binDir, libDir, libNames) {
  if (path.resolve(libDir) === path.resolve(binDir)) return;
  for (const libName of libNames) {
    const flatPath = path.join(binDir, libName);
    if (fs.existsSync(flatPath)) fs.unlinkSync(flatPath);
  }
}

let cachedRelease = null;

async function getRelease() {
  if (cachedRelease) return cachedRelease;
  cachedRelease = await fetchLatestRelease(LLAMA_CPP_REPO, { tag: LLAMA_CPP_TAG });
  return cachedRelease;
}

function findAsset(release, pattern) {
  return release?.assets?.find((a) => pattern.test(a.name));
}

async function downloadBinary(key, config, release, isForce = false) {
  if (!config) {
    console.log(`  ${key}: Not supported`);
    return false;
  }

  const outputPath = path.join(BIN_DIR, config.outputName);

  if (!isForce && isCompleteInstall(BIN_DIR, config)) {
    console.log(`  ${key}: Already exists (use --force to re-download)`);
    return true;
  }

  const asset = findAsset(release, config.assetPattern);
  if (!asset) {
    console.error(`  ${key}: No matching asset found for pattern ${config.assetPattern}`);
    return false;
  }

  console.log(`  ${key}: Downloading from ${asset.url}`);

  const zipPath = path.join(BIN_DIR, asset.name);

  try {
    await downloadFile(asset.url, zipPath);

    const extractDir = path.join(BIN_DIR, `temp-llama-${key}`);
    fs.mkdirSync(extractDir, { recursive: true });
    await extractArchive(zipPath, extractDir);

    const binaryName = path.basename(config.binaryPath);
    let binaryPath = path.join(extractDir, config.binaryPath);

    if (!fs.existsSync(binaryPath)) {
      binaryPath = findBinaryInDir(extractDir, binaryName);
    }

    if (binaryPath && fs.existsSync(binaryPath)) {
      fs.copyFileSync(binaryPath, outputPath);
      setExecutable(outputPath);
      console.log(`  ${key}: Extracted to ${config.outputName}`);

      if (config.libPattern) {
        const libDir = libraryDirFor(BIN_DIR, config);
        fs.mkdirSync(libDir, { recursive: true });
        const copied = copyLibraries(extractDir, libDir, config.libPattern);
        for (const libName of copied) {
          console.log(`  ${key}: Copied library ${libName}`);
        }
        removeFlatLibraries(BIN_DIR, libDir, copied);
        ensureLoaderRpath(outputPath, loaderRpath(config));
      }
    } else {
      console.error(`  ${key}: Binary '${binaryName}' not found in archive`);
      return false;
    }

    fs.rmSync(extractDir, { recursive: true, force: true });
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    return true;
  } catch (error) {
    console.error(`  ${key}: Failed - ${error.message}`);
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    return false;
  }
}

function getEntriesForPlatformArch(platformArch) {
  return Object.entries(BINARIES).filter(([, config]) => config.platformArch === platformArch);
}

async function main() {
  console.log(`\n[llama-server] Using pinned version: ${LLAMA_CPP_TAG}`);
  const release = await getRelease();

  if (!release) {
    console.error(`[llama-server] Could not fetch release from ${LLAMA_CPP_REPO}`);
    console.log(`\nMake sure release exists: https://github.com/${LLAMA_CPP_REPO}/releases`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nDownloading llama-server binaries (${release.tag})...\n`);

  fs.mkdirSync(BIN_DIR, { recursive: true });

  const args = parseArgs();

  if (args.isCurrent) {
    const entries = getEntriesForPlatformArch(args.platformArch);

    if (entries.length === 0) {
      console.error(formatUnsupportedPlatformError(args.platformArch));
      process.exitCode = 1;
      return;
    }

    console.log(`Downloading for target platform (${args.platformArch}):`);

    for (const [key, config] of entries) {
      const ok = await downloadBinary(key, config, release, args.isForce);
      if (!ok && config.optional) {
        console.warn(`  ${key}: Skipping optional variant`);
      } else if (!ok) {
        console.error(`Failed to download binaries for ${key}`);
        process.exitCode = 1;
        return;
      }
    }

    if (args.shouldCleanup) {
      cleanupFiles(BIN_DIR, "llama-server", `llama-server-${args.platformArch}`);
    }
  } else {
    console.log("Downloading binaries for all platforms:");
    for (const [key, config] of Object.entries(BINARIES)) {
      const ok = await downloadBinary(key, config, release, args.isForce);
      if (!ok && config.optional) {
        console.warn(`  ${key}: Skipping optional variant`);
      }
    }
  }

  console.log("\n---");

  const files = fs.readdirSync(BIN_DIR).filter((f) => f.startsWith("llama-server"));
  if (files.length > 0) {
    console.log("Available llama-server binaries:\n");
    files.forEach((f) => {
      const stats = fs.statSync(path.join(BIN_DIR, f));
      console.log(`  - ${f} (${Math.round(stats.size / 1024 / 1024)}MB)`);
    });
  } else {
    console.log("No binaries downloaded yet.");
    console.log(`\nMake sure release exists: https://github.com/${LLAMA_CPP_REPO}/releases`);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  BINARIES,
  DARWIN_IMPL_LIB,
  isCompleteInstall,
  libraryDirFor,
  loaderRpath,
  removeFlatLibraries,
};
