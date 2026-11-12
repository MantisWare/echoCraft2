const test = require("node:test");
const assert = require("node:assert/strict");
const { buildThemeCss } = require("../../src/helpers/omarchyTheme");
test("maps the system palette and font without accepting arbitrary CSS values", () => {
  const css = buildThemeCss(
    'background="#141A19"\nforeground="#E1EAE6"\naccent="#8FD6BD"\nred="url(https://example.com)"',
    "JetBrainsMono Nerd Font"
  );
  assert.ok(css.includes("--color-primary: #8FD6BD"));
  assert.ok(css.includes("--color-primary-foreground: #141A19"));
  assert.ok(css.includes("JetBrainsMono Nerd Font"));
  assert.ok(!css.includes("https://"));
});
test("does not replace the last good theme with a partially written palette", () => {
  assert.equal(buildThemeCss('background="#141A19"'), null);
});
