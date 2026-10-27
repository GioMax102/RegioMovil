import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/theme.css', import.meta.url), 'utf8');
const tokens = (block) =>
  Object.fromEntries(
    [...block.matchAll(/(--[\w-]+):\s*(#[\da-f]{6});/gi)].map(([, key, value]) => [key, value]),
  );
const light = tokens(css.match(/:root\s*\{([^}]+)\}/)[1]);
const dark = { ...light, ...tokens(css.match(/:root\[data-theme='dark'\]\s*\{([^}]+)\}/)[1]) };
function luminance(hex) {
  const channels = [1, 3, 5].map((index) => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (values[1] + 0.05) / (values[0] + 0.05);
}

// SC 1.4.3 threshold, without rounding. This guards semantic pairs, not every
// rendered pixel or the rest of WCAG: browser/assistive-device checks still apply.
for (const [name, theme] of Object.entries({ light, dark })) {
  test(`${name}: text and meaning-bearing accents retain WCAG AA contrast`, () => {
    const pairs = [
      ...['--white', '--surface', '--cream', '--soft'].flatMap((background) =>
        ['--dark', '--muted', '--green'].map((text) => [text, background]),
      ),
      ['--on-primary', '--app-primary'],
      ['--accent-blue', '--accent-blue-surface'],
      ['--accent-amber', '--accent-amber-surface'],
      ['--app-warning-text', '--app-warning-surface'],
      ['--app-danger-text', '--app-danger-surface'],
    ];
    for (const [foreground, background] of pairs) {
      const ratio = contrast(theme[foreground], theme[background]);
      assert.ok(ratio >= 4.5, `${name}: ${foreground} on ${background}: ${ratio}:1`);
    }
    for (const background of ['--white', '--surface', '--cream', '--soft']) {
      assert.ok(
        contrast(theme['--focus'], theme[background]) >= 3,
        `${name}: focus on ${background}`,
      );
    }
  });
}
