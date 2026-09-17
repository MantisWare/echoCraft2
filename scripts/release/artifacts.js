const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  ARTIFACT_EXTENSIONS,
  EXCLUDED_BASENAMES,
  PLATFORM_NAME_MARKERS,
  PLATFORMS,
} = require("./constants");

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseUpdateYml(contents) {
  if (typeof contents !== "string" || contents.trim() === "") {
    throw new Error("manifest is empty");
  }

  const files = [];
  let version = null;
  let manifestPath = null;
  let sha512 = null;
  let currentFile = null;
  let inFiles = false;

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, "  ");
    if (line.trim() === "" || line.trim().startsWith("#")) continue;

    const versionMatch = line.match(/^version:\s*(.+)$/);
    if (versionMatch) {
      version = unquote(versionMatch[1]);
      currentFile = null;
      inFiles = false;
      continue;
    }

    if (/^files:\s*$/.test(line)) {
      inFiles = true;
      currentFile = null;
      continue;
    }

    const urlMatch = line.match(/^\s+-\s+url:\s*(.+)$/);
    if (urlMatch) {
      currentFile = { url: unquote(urlMatch[1]) };
      files.push(currentFile);
      continue;
    }

    const nestedSha = line.match(/^\s+sha512:\s*(.+)$/);
    if (nestedSha && currentFile) {
      currentFile.sha512 = unquote(nestedSha[1]);
      continue;
    }

    const nestedSize = line.match(/^\s+size:\s*(.+)$/);
    if (nestedSize && currentFile) {
      currentFile.size = Number(unquote(nestedSize[1]));
      continue;
    }

    const pathMatch = line.match(/^path:\s*(.+)$/);
    if (pathMatch) {
      manifestPath = unquote(pathMatch[1]);
      currentFile = null;
      inFiles = false;
      continue;
    }

    const topSha = line.match(/^sha512:\s*(.+)$/);
    if (topSha && !inFiles) {
      sha512 = unquote(topSha[1]);
      continue;
    }
  }

  if (!version) {
    throw new Error("manifest is missing version");
  }
  if (files.length === 0) {
    throw new Error("manifest lists no files");
  }

  return { version, files, path: manifestPath, sha512 };
}

function hasExtension(fileName, extension) {
  return fileName.toLowerCase().endsWith(extension.toLowerCase());
}

function matchesPlatform(fileName, platformId) {
  const lower = fileName.toLowerCase();
  const markers = PLATFORM_NAME_MARKERS[platformId];
  return markers.some((marker) => lower.includes(marker.toLowerCase()));
}

function isManifestFile(fileName) {
  return /^latest(-mac|-linux|-linux-arm64)?\.yml$/.test(fileName);
}

function listOutputFiles(outputDir) {
  if (!fs.existsSync(outputDir)) {
    throw new Error(`Build directory not found at ${outputDir}`);
  }
  return fs
    .readdirSync(outputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
}

function selectReleaseArtifacts(fileNames, platformId) {
  const config = PLATFORMS[platformId];
  if (!config) {
    throw new Error(`Unknown release platform "${platformId}"`);
  }

  const extensions = ARTIFACT_EXTENSIONS[platformId];
  const artifacts = fileNames.filter((fileName) => {
    if (EXCLUDED_BASENAMES.has(fileName)) return false;
    if (isManifestFile(fileName)) return false;
    if (!matchesPlatform(fileName, platformId)) return false;
    return extensions.some((extension) => hasExtension(fileName, extension));
  });

  const hasManifest = fileNames.includes(config.manifest);
  return {
    artifacts,
    manifest: hasManifest ? config.manifest : null,
  };
}

function discoverUploadablePlatforms(fileNames) {
  return Object.keys(PLATFORMS).map((id) => {
    const config = PLATFORMS[id];
    const selected = selectReleaseArtifacts(fileNames, id);
    const marker = PLATFORM_NAME_MARKERS[id][0];
    if (!selected.manifest && selected.artifacts.length === 0) {
      return {
        id,
        selected,
        status: "missing",
        reason: `no ${config.manifest} or ${marker} artifacts in dist/`,
      };
    }
    if (!selected.manifest) {
      return {
        id,
        selected,
        status: "incomplete",
        reason: `found ${selected.artifacts.length} artifact(s) but missing ${config.manifest}`,
      };
    }
    if (selected.artifacts.length === 0) {
      return {
        id,
        selected,
        status: "incomplete",
        reason: `found ${config.manifest} but no ${id} artifacts`,
      };
    }
    return { id, selected, status: "ready", reason: null };
  });
}

function sha512Base64(filePath) {
  const hash = crypto.createHash("sha512");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("base64");
}

function validateManifest({
  manifest,
  outputDir,
  expectedVersion,
  selectedArtifacts,
}) {
  if (manifest.version !== expectedVersion) {
    throw new Error(
      `manifest version ${manifest.version} does not match package version ${expectedVersion}`
    );
  }

  const artifactSet = new Set(selectedArtifacts);
  const referenced = [];

  for (const file of manifest.files) {
    if (!file.url) {
      throw new Error("manifest file entry is missing url");
    }
    const filePath = path.join(outputDir, file.url);
    if (!fs.existsSync(filePath)) {
      throw new Error(`manifest references missing file: ${file.url}`);
    }
    if (!artifactSet.has(file.url) && !file.url.endsWith(".blockmap")) {
      // Blockmaps may be listed; they must still exist. Artifacts selected
      // from the output dir should include them when present.
    }
    if (file.sha512) {
      const actual = sha512Base64(filePath);
      if (actual !== file.sha512) {
        throw new Error(`checksum mismatch for ${file.url}`);
      }
    }
    if (typeof file.size === "number" && Number.isFinite(file.size)) {
      const actualSize = fs.statSync(filePath).size;
      if (actualSize !== file.size) {
        throw new Error(
          `size mismatch for ${file.url}: expected ${file.size}, got ${actualSize}`
        );
      }
    }
    referenced.push(file.url);
  }

  return referenced;
}

function buildUploadPlan({ artifacts, manifestName, referencedUrls }) {
  if (!manifestName) {
    throw new Error("platform manifest is missing");
  }

  const uniqueArtifacts = [
    ...new Set([
      ...artifacts.filter((name) => name !== manifestName),
      ...referencedUrls.filter((name) => name !== manifestName),
    ]),
  ];

  if (uniqueArtifacts.includes(manifestName)) {
    throw new Error("manifest must not be uploaded with artifacts");
  }

  return {
    artifacts: uniqueArtifacts,
    manifest: manifestName,
    order: [...uniqueArtifacts, manifestName],
  };
}

function readPackageIdentity(projectRoot) {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")
  );
  const lockPath = path.join(projectRoot, "package-lock.json");
  const lockfile = fs.existsSync(lockPath)
    ? JSON.parse(fs.readFileSync(lockPath, "utf8"))
    : null;

  if (lockfile && lockfile.version !== packageJson.version) {
    throw new Error(
      `package.json version ${packageJson.version} does not match package-lock.json ${lockfile.version}`
    );
  }
  if (lockfile?.packages?.[""]?.version && lockfile.packages[""].version !== packageJson.version) {
    throw new Error(
      `package-lock.json packages[""].version ${lockfile.packages[""].version} does not match package.json ${packageJson.version}`
    );
  }

  return {
    name: packageJson.name,
    version: packageJson.version,
  };
}

module.exports = {
  parseUpdateYml,
  selectReleaseArtifacts,
  discoverUploadablePlatforms,
  listOutputFiles,
  sha512Base64,
  validateManifest,
  buildUploadPlan,
  readPackageIdentity,
  isManifestFile,
};
