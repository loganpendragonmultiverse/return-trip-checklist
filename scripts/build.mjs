import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { bundlePage } from "./bundle.mjs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pkg.name))
  throw new Error("Invalid package name.");
const dist = path.resolve("dist");
const out = path.resolve(dist, pkg.name);
if (path.dirname(out) !== dist)
  throw new Error("Build output must stay inside dist.");
if (fs.existsSync(out) && fs.lstatSync(out).isSymbolicLink())
  throw new Error("Refusing a symlinked build output.");
fs.mkdirSync(dist, { recursive: true });
// dist/<package-name> is generated output, never an input or user-data directory.
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const read = (file) => fs.readFileSync(file, "utf8");
const template = read("index.html");
const html = bundlePage(template, {
  config: read("src/config.js"),
  core: read("src/core.js"),
  app: read("src/app.js"),
  styles: read("src/styles.css"),
});
fs.writeFileSync(path.join(out, "index.html"), html);
fs.mkdirSync(path.join(dist, "site"), { recursive: true });
fs.writeFileSync(path.join(dist, "site", "index.html"), html);

// Keep the directly-openable app at the ZIP root and a complete, rebuildable
// repository tree in source/, including its original module-based index.html.
const source = path.join(out, "source");
fs.mkdirSync(source, { recursive: true });
const rootFiles = fs
  .readdirSync(".")
  .filter(
    (file) =>
      /\.md$/.test(file) ||
      [
        "LICENSE",
        "package.json",
        "package-lock.json",
        "playwright.config.mjs",
        ".gitignore",
        ".prettierignore",
      ].includes(file),
  );
for (const file of rootFiles) {
  if (!fs.statSync(file).isFile()) continue;
  fs.copyFileSync(file, path.join(source, file));
  if (/\.md$/.test(file) || file === "LICENSE")
    fs.copyFileSync(file, path.join(out, file));
}
fs.copyFileSync("index.html", path.join(source, "index.html"));
for (const dir of [
  "src",
  "scripts",
  "test",
  "browser-tests",
  "examples",
  ".github",
]) {
  if (fs.existsSync(dir))
    fs.cpSync(dir, path.join(source, dir), { recursive: true });
}
const zip = path.join(dist, `${pkg.name}-${pkg.version}.zip`);
const python = `import sys,zipfile,pathlib
root=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2], 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for p in sorted(root.rglob('*')):
        if p.is_file():
            info=zipfile.ZipInfo(p.relative_to(root).as_posix(), date_time=(2020,1,1,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED
            info.create_system=3
            info.external_attr=0o100644 << 16
            archive.writestr(info, p.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
`;
execFileSync("python", ["-c", python, out, zip]);
const digest = createHash("sha256").update(fs.readFileSync(zip)).digest("hex");
fs.writeFileSync(
  path.join(dist, "SHA256SUMS"),
  `${digest}  ${path.basename(zip)}\n`,
);
console.log(`Built ${zip}`);
