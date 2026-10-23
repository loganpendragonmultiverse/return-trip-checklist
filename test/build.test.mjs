import test from "node:test";
import assert from "node:assert/strict";
import { inlineModule, bundlePage } from "../scripts/bundle.mjs";

test("formatted multiline static imports are removed and only export declarations change", () => {
  const source = `import {
    config,
    anotherValue,
  } from './config.js';
export const label = "export this wording";
export function example() { return label; }
`;
  const bundled = inlineModule(source);
  assert.ok(!bundled.includes("from"));
  assert.ok(bundled.includes('const label = "export this wording"'));
  assert.ok(bundled.includes("function example()"));
});

test("formatted entry tags and replacement-token text survive bundling literally", () => {
  const html = `<html><head><link
    href="src/styles.css"
    rel="stylesheet"
  /></head><body><script
    src="src/app.js"
    type="module"
  ></script></body></html>`;
  const output = bundlePage(html, {
    config: "export const config = {};",
    core: 'export const marker = "$&";',
    app: 'const closing = "</script>";',
    styles: '.x::after{content:"$&"}',
  });
  assert.ok(output.includes('const marker = "$&";'));
  assert.ok(output.includes('.x::after{content:"$&"}'));
  assert.ok(output.includes('"<\\/script>"'));
  assert.ok(!output.includes('src="src/app.js"'));
  assert.ok(!output.includes('href="src/styles.css"'));
});

test("missing or duplicated entry points fail rather than emit an incomplete offline page", () => {
  const parts = { config: "", core: "", app: "", styles: "" };
  assert.throws(() => bundlePage("<html></html>", parts), /exactly one/);
  assert.throws(
    () =>
      bundlePage(
        '<link rel="stylesheet" href="src/styles.css"><script type="module" src="src/app.js"></script><script type="module" src="src/app.js"></script>',
        parts,
      ),
    /exactly one/,
  );
});
