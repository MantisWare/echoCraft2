const UNITS = ["B", "KB", "MB", "GB", "TB"];

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  if (unit === 0) return `${Math.round(value)} B`;
  const digits = value >= 10 ? 1 : 2;
  return `${parseFloat(value.toFixed(digits))} ${UNITS[unit]}`;
}

function percentComplete(transferred, fileSize) {
  if (!Number.isFinite(fileSize) || fileSize <= 0) return 100;
  if (!Number.isFinite(transferred) || transferred <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((transferred / fileSize) * 100)));
}

function formatBar(percent, width = 16) {
  const clamped = Math.min(100, Math.max(0, percent));
  const filled = Math.round((clamped / 100) * width);
  return `[${"#".repeat(filled)}${"-".repeat(Math.max(0, width - filled))}]`;
}

function formatUploadProgress({
  fileName,
  fileSize,
  transferred,
  index,
  total,
  done = false,
}) {
  const percent = percentComplete(transferred, fileSize);
  const verb = done === true ? "uploaded" : "uploading";
  return (
    `  [${index}/${total}] ${verb} ${fileName}  ${formatBar(percent)}  ` +
    `${percent}%  ${formatBytes(transferred)} / ${formatBytes(fileSize)}`
  );
}

function createUploadIndicator(options = {}) {
  const stream = options.stream ?? process.stdout;
  const isTTY = options.isTTY ?? Boolean(stream.isTTY);
  const now = options.now ?? (() => Date.now());
  const intervalMs = options.intervalMs ?? (isTTY ? 200 : 2000);
  let lastRenderAt = 0;
  let lastPercent = -1;
  let lastRendered = "";

  function render(line, { newline = false } = {}) {
    if (isTTY) {
      const padded =
        line.length < lastRendered.length
          ? line + " ".repeat(lastRendered.length - line.length)
          : line;
      stream.write(`\r${padded}`);
      lastRendered = padded;
      if (newline) {
        stream.write("\n");
        lastRendered = "";
      }
    } else {
      stream.write(`${line}\n`);
    }
    lastRenderAt = now();
  }

  function start(event) {
    lastPercent = -1;
    lastRenderAt = 0;
    const line = formatUploadProgress({ ...event, transferred: 0 });
    lastPercent = percentComplete(0, event.fileSize);
    render(line, { newline: !isTTY });
  }

  function progress(event) {
    const percent = percentComplete(event.transferred, event.fileSize);
    const done = event.done === true;
    const elapsed = now() - lastRenderAt;
    const jumped = percent - lastPercent >= 10;
    if (!done && elapsed < intervalMs && !jumped) return;
    lastPercent = percent;
    render(formatUploadProgress(event), { newline: done });
  }

  return { start, progress };
}

module.exports = {
  formatBytes,
  percentComplete,
  formatBar,
  formatUploadProgress,
  createUploadIndicator,
};
