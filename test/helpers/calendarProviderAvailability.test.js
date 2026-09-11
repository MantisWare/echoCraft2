const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveCalendarProviderAvailability,
} = require("../../src/helpers/calendarProviderAvailability");
const {
  shouldShowCalendarProvider,
} = require("../../src/hooks/useCalendarProviderAvailability.ts");

const CONFIGURED = {
  GOOGLE_CALENDAR_CLIENT_ID: "gcal-client-id",
  GOOGLE_CALENDAR_CLIENT_SECRET: "gcal-client-secret",
  MICROSOFT_CALENDAR_CLIENT_ID: "mcal-client-id",
};

test("a fully configured build offers every provider", () => {
  const availability = resolveCalendarProviderAvailability({
    env: CONFIGURED,
    platform: "darwin",
  });

  assert.deepEqual(availability, { google: true, microsoft: true, apple: true });
});

test("a build with no credentials offers no OAuth provider", () => {
  const availability = resolveCalendarProviderAvailability({ env: {}, platform: "darwin" });

  assert.equal(availability.google, false);
  assert.equal(availability.microsoft, false);
  // Apple needs no credentials — it reads local EventKit data.
  assert.equal(availability.apple, true);
});

test("configuring one provider does not offer the other", () => {
  const googleOnly = resolveCalendarProviderAvailability({
    env: {
      GOOGLE_CALENDAR_CLIENT_ID: CONFIGURED.GOOGLE_CALENDAR_CLIENT_ID,
      GOOGLE_CALENDAR_CLIENT_SECRET: CONFIGURED.GOOGLE_CALENDAR_CLIENT_SECRET,
    },
    platform: "linux",
  });
  assert.deepEqual(googleOnly, { google: true, microsoft: false, apple: false });

  const microsoftOnly = resolveCalendarProviderAvailability({
    env: { MICROSOFT_CALENDAR_CLIENT_ID: CONFIGURED.MICROSOFT_CALENDAR_CLIENT_ID },
    platform: "linux",
  });
  assert.deepEqual(microsoftOnly, { google: false, microsoft: true, apple: false });
});

test("Google needs both halves of its credential pair", () => {
  // Google is a confidential-style desktop client: the token exchange posts
  // client_secret, so an id alone cannot complete the flow.
  const idOnly = resolveCalendarProviderAvailability({
    env: { GOOGLE_CALENDAR_CLIENT_ID: CONFIGURED.GOOGLE_CALENDAR_CLIENT_ID },
    platform: "linux",
  });
  assert.equal(idOnly.google, false);

  const secretOnly = resolveCalendarProviderAvailability({
    env: { GOOGLE_CALENDAR_CLIENT_SECRET: CONFIGURED.GOOGLE_CALENDAR_CLIENT_SECRET },
    platform: "linux",
  });
  assert.equal(secretOnly.google, false);
});

test("Microsoft needs no secret — it is a PKCE public client", () => {
  const availability = resolveCalendarProviderAvailability({
    env: { MICROSOFT_CALENDAR_CLIENT_ID: CONFIGURED.MICROSOFT_CALENDAR_CLIENT_ID },
    platform: "linux",
  });

  assert.equal(availability.microsoft, true);
});

test("Apple tracks the platform, not credentials", () => {
  for (const platform of ["win32", "linux"]) {
    assert.equal(resolveCalendarProviderAvailability({ env: CONFIGURED, platform }).apple, false);
  }
  assert.equal(
    resolveCalendarProviderAvailability({ env: CONFIGURED, platform: "darwin" }).apple,
    true
  );
});

test("blank and whitespace-only credentials do not count as configured", () => {
  const availability = resolveCalendarProviderAvailability({
    env: {
      GOOGLE_CALENDAR_CLIENT_ID: "",
      GOOGLE_CALENDAR_CLIENT_SECRET: "   ",
      MICROSOFT_CALENDAR_CLIENT_ID: "\t\n",
    },
    platform: "linux",
  });

  assert.deepEqual(availability, { google: false, microsoft: false, apple: false });
});

test("the .env.example placeholders do not count as configured", () => {
  // Copying .env.example to .env verbatim would otherwise show the rows and
  // fail at the consent screen instead of hiding them.
  const availability = resolveCalendarProviderAvailability({
    env: {
      GOOGLE_CALENDAR_CLIENT_ID: "your_google_calendar_client_id_here",
      GOOGLE_CALENDAR_CLIENT_SECRET: "your_google_calendar_client_secret_here",
      MICROSOFT_CALENDAR_CLIENT_ID: "your_microsoft_calendar_client_id_here",
    },
    platform: "linux",
  });

  assert.deepEqual(availability, { google: false, microsoft: false, apple: false });
});

test("non-string credential values are rejected", () => {
  const availability = resolveCalendarProviderAvailability({
    env: { GOOGLE_CALENDAR_CLIENT_ID: 12345, GOOGLE_CALENDAR_CLIENT_SECRET: true },
    platform: "linux",
  });

  assert.equal(availability.google, false);
});

test("a configured provider is shown whether or not it is connected", () => {
  assert.equal(shouldShowCalendarProvider({ configured: true, connected: false }), true);
  assert.equal(shouldShowCalendarProvider({ configured: true, connected: true }), true);
});

test("an unconfigured provider is hidden", () => {
  assert.equal(shouldShowCalendarProvider({ configured: false, connected: false }), false);
});

test("a provider that lost its credentials stays visible while accounts are linked", () => {
  // Hiding it would strand the linked accounts with no route to disconnect.
  assert.equal(shouldShowCalendarProvider({ configured: false, connected: true }), true);
});
