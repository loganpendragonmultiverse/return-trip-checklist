import { execFileSync } from "node:child_process";
for (const file of [
  "src/config.js",
  "src/core.js",
  "src/app.js",
  "scripts/build.mjs",
  "scripts/bundle.mjs",
])
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
console.log("JavaScript syntax checks passed.");
