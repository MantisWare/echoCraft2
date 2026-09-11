// Which calendar providers this build can actually offer.
//
// Google and Microsoft need OAuth client credentials baked into the build-time
// .env (see .env.example). They are app-level credentials, not per-user keys,
// so a build without them can never complete those flows — Microsoft throws on
// startOAuthFlow() and Google would otherwise open an authorize URL with
// client_id=undefined and hang until the 120s loopback timeout. Offering the
// row at all is the bug; the UI hides what this module reports unavailable.
//
// Apple needs no credentials: it reads local EventKit data through the bundled
// macos-calendar-listener helper, so it is available on macOS and nowhere else.

const CALENDAR_PROVIDER_IDS = ["google", "microsoft", "apple"];

// `.env.example` ships `your_*_here` placeholders. Copying it to `.env`
// verbatim would otherwise register as configured and fail at the consent
// screen instead of hiding the row.
const PLACEHOLDER_PATTERN = /^your_.*_here$/i;

function isConfiguredValue(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed === "") return false;
  return !PLACEHOLDER_PATTERN.test(trimmed);
}

// Credentials are read at call time rather than cached: EnvironmentManager can
// reload .env after startup (saveAllKeysToEnvFile), and tests inject env.
function resolveCalendarProviderAvailability({
  env = process.env,
  platform = process.platform,
} = {}) {
  return {
    google:
      isConfiguredValue(env.GOOGLE_CALENDAR_CLIENT_ID) &&
      isConfiguredValue(env.GOOGLE_CALENDAR_CLIENT_SECRET),
    microsoft: isConfiguredValue(env.MICROSOFT_CALENDAR_CLIENT_ID),
    apple: platform === "darwin",
  };
}

// The matching UI rule — whether a row renders — lives beside the renderer hook
// in src/hooks/useCalendarProviderAvailability.ts. This module stays CommonJS
// for the main process and must not be imported by the renderer.
module.exports = {
  CALENDAR_PROVIDER_IDS,
  resolveCalendarProviderAvailability,
};
