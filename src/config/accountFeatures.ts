/**
 * Account UI kill switch.
 *
 * This build runs entirely on local models and BYOK providers, so signing in
 * buys the user nothing: notes sync, workspaces, teams, and sharing all hang
 * off an account that has nowhere to connect. Rather than delete those flows,
 * every entry point into them is gated on this flag, so flipping it back to
 * `true` restores the whole experience.
 *
 * Surfaces gated by this flag are the ones reachable while signed out — the
 * onboarding auth step, the re-auth screen, the Settings account section, the
 * sidebar account row, the invitation deep link, and the upload CTA. The rest
 * of the account UI already renders only when `isSignedIn` is true, which can
 * no longer happen.
 */
export const ACCOUNT_UI_ENABLED = false;
