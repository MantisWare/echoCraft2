function npmSpawnOptions(platform = process.platform) {
  // npm on Windows is npm.cmd. CreateProcess does not resolve that extension,
  // so the spawn has to go through cmd.exe.
  return {
    command: "npm",
    shell: platform === "win32",
  };
}

function formatCommandFailure(label, result) {
  if (result.error && (result.status === null || result.status === undefined)) {
    return `${label} failed to start: ${result.error.message}`;
  }
  return `${label} failed with exit code ${result.status ?? 1}`;
}

module.exports = {
  npmSpawnOptions,
  formatCommandFailure,
};
