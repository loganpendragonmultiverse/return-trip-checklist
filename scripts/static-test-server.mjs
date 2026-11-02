import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

// Only callers' fixed route manifests are read, before any request handler
// exists. Request URLs are Map keys and never become filesystem paths.
export async function createStaticTestServer(groups) {
  const assets = new Map();
  for (const group of groups) {
    const root = await realpath(group.root);
    for (const [route, relative] of group.routes) {
      if (
        !route.startsWith("/") ||
        /[?#]/.test(route) ||
        assets.has(route) ||
        path.isAbsolute(relative)
      )
        throw new Error("Invalid or duplicate static test route");
      const file = await realpath(path.resolve(root, relative));
      const within = path.relative(root, file);
      if (
        within === ".." ||
        within.startsWith(".." + path.sep) ||
        path.isAbsolute(within) ||
        !(await stat(file)).isFile()
      )
        throw new Error("Static test asset is outside its allowed root");
      const type = file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".json")
            ? "application/json"
            : "text/html";
      assets.set(route, { bytes: await readFile(file), type });
    }
  }
  return createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    const route = (request.url || "").split(/[?#]/, 1)[0];
    const asset = assets.get(route);
    if (!asset) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": asset.type,
      "Cache-Control": "no-store",
    });
    response.end(request.method === "HEAD" ? undefined : asset.bytes);
  });
}
