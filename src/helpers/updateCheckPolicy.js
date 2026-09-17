// The "App updates" toggle gates the automatic checks themselves, not just the
// popup: with it off the app must not reach the update feed, so offline or
// firewalled machines never surface a connection error dialog (#1605).
// Only an explicit false disables — missing prefs (renderer sync not arrived
// yet) keep check-by-default behavior.
function appUpdatesEnabled({ notificationsEnabled, notifyUpdates } = {}) {
  return notificationsEnabled !== false && notifyUpdates !== false;
}

// v1's live Nextcloud feed is still 0.11.12. Never treat that (or anything
// older than 2.0.1) as an installable update, or a v2 client can "update"
// back onto EchoCraft v1.
const MIN_FEED_VERSION = "2.0.1";
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

function compareSemver(left, right) {
  const a = SEMVER_RE.exec(left ?? "");
  const b = SEMVER_RE.exec(right ?? "");
  if (a === null || b === null) return null;
  for (let index = 1; index <= 3; index += 1) {
    const delta = Number(a[index]) - Number(b[index]);
    if (delta !== 0) return delta < 0 ? -1 : 1;
  }
  return 0;
}

function isAcceptableFeedVersion(version, minimum = MIN_FEED_VERSION) {
  return (compareSemver(version, minimum) ?? -1) >= 0;
}

module.exports = {
  appUpdatesEnabled,
  MIN_FEED_VERSION,
  compareSemver,
  isAcceptableFeedVersion,
};
