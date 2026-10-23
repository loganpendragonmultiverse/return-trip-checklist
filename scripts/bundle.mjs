// Bundle only this project's static modules; unsupported syntax fails closed.
export function inlineModule(source) {
  const imports =
    /^[\t ]*import\s+(?:[\w$*\s{},]+\s+from\s*)?["'][^"'\r\n]+["'][\t ]*;?[\t ]*(?:\r?\n|$)/gm;
  const declarations =
    /^[\t ]*export\s+(?=(?:const|let|var|class|function|async\s+function)\b)/gm;
  const result = source
    .replace(imports, () => "")
    .replace(declarations, () => "");
  if (/^[\t ]*(?:import\s|export\s)/m.test(result)) {
    throw new Error(
      "The offline builder found an unsupported module declaration.",
    );
  }
  return result;
}

export function bundlePage(template, { config, core, app, styles }) {
  const stylesheet =
    /<link\b(?=[^>]*\brel\s*=\s*["']stylesheet["'])(?=[^>]*\bhref\s*=\s*["'](?:\.\/)?src\/styles\.css["'])[^>]*\/?\s*>/gi;
  const entry =
    /<script\b(?=[^>]*\btype\s*=\s*["']module["'])(?=[^>]*\bsrc\s*=\s*["'](?:\.\/)?src\/app\.js["'])[^>]*>\s*<\/script\s*>/gi;
  if (
    [...template.matchAll(stylesheet)].length !== 1 ||
    [...template.matchAll(entry)].length !== 1
  ) {
    throw new Error(
      "The offline entry must have exactly one stylesheet and one application module.",
    );
  }
  const script = [config, core, app]
    .map(inlineModule)
    .join("\n")
    .replace(/<\/script/gi, () => "<\\/script");
  return template
    .replace(stylesheet, () => `<style>${styles}</style>`)
    .replace(entry, () => `<script type="module">${script}</script>`);
}
