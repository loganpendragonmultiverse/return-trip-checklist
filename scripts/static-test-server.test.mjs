import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { request } from "node:http";
import { createStaticTestServer } from "./static-test-server.mjs";

const get = (server, target, method = "GET") =>
  new Promise((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port: server.address().port, path: target, method },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });

test("static routes serve only preloaded assets and reject traversal/private paths", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "static-test-server-"));
  const root = path.join(temporary, "public");
  await mkdir(root);
  await writeFile(path.join(root, "index.html"), "public fixture");
  await writeFile(path.join(temporary, "private.txt"), "must never be served");
  let server;
  try {
    server = await createStaticTestServer([
      {
        root,
        routes: [
          ["/", "index.html"],
          ["/index.html", "index.html"],
        ],
      },
    ]);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    assert.deepEqual(await get(server, "/"), {
      status: 200,
      body: "public fixture",
    });
    assert.equal((await get(server, "/?qa=1")).status, 200);
    assert.deepEqual(await get(server, "/", "HEAD"), { status: 200, body: "" });
    assert.equal((await get(server, "/", "POST")).status, 405);
    for (const target of [
      "/../private.txt",
      "/%2e%2e/private.txt",
      "/%2e%2e%2fprivate.txt",
      "/..%5cprivate.txt",
      "/.git/config",
      "/private.txt",
      "/index.html/../../private.txt",
      "/%ZZ",
    ])
      assert.equal((await get(server, target)).status, 404, target);
    await assert.rejects(
      createStaticTestServer([{ root, routes: [["/leak", "../private.txt"]] }]),
      /outside/,
    );
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await rm(temporary, { recursive: true, force: true });
  }
});

test("preloading refuses an allowed-name symlink outside its root", async (context) => {
  const temporary = await mkdtemp(path.join(tmpdir(), "static-test-symlink-"));
  const root = path.join(temporary, "public");
  await mkdir(root);
  await writeFile(path.join(temporary, "private.txt"), "must never be served");
  try {
    try {
      await symlink(
        path.join(temporary, "private.txt"),
        path.join(root, "index.html"),
        "file",
      );
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
        context.skip(
          "Host does not permit creating the synthetic symlink fixture",
        );
        return;
      }
      throw error;
    }
    await assert.rejects(
      createStaticTestServer([{ root, routes: [["/", "index.html"]] }]),
      /outside/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
