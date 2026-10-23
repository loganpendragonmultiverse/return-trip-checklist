import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { config } from "../src/config.js";

let server, origin, extracted;
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const storageKey = `${config.slug}:v1`;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aA9sAAAAASUVORK5CYII=",
  "base64",
);
const backup = (item) => ({
  format: config.slug,
  version: 1,
  records: [
    { ...config.sample[0], item, id: "browser-fixture", attachments: [] },
  ],
});

test.beforeAll(async () => {
  extracted = mkdtempSync(path.join(tmpdir(), `${config.slug}-zip-`));
  execFileSync("python", [
    "-c",
    "import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])",
    path.join(projectRoot, "dist", `${config.slug}-1.0.0.zip`),
    extracted,
  ]);
  server = createServer((req, res) => {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const prefix = pathname.startsWith("/package/") ? "/package/" : "/source/";
    const root = prefix === "/package/" ? extracted : projectRoot;
    const file = path.resolve(root, pathname.slice(prefix.length));
    if (
      !file.startsWith(path.resolve(root) + path.sep) ||
      !existsSync(file) ||
      !statSync(file).isFile()
    ) {
      res.writeHead(404).end();
      return;
    }
    const ext = path.extname(file);
    res.setHeader(
      "content-type",
      ext === ".js"
        ? "text/javascript"
        : ext === ".css"
          ? "text/css"
          : ext === ".json"
            ? "application/json"
            : "text/html",
    );
    res.end(readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

for (const mode of ["source", "package-http", "package-file"]) {
  const url = () =>
    mode === "package-file"
      ? pathToFileURL(path.join(extracted, "index.html")).href
      : `${origin}/${mode === "source" ? "source" : "package"}/index.html`;

  test(`${mode}: complete record, attachment, backup and printable output`, async ({
    page,
    browserName,
  }, testInfo) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url());
    await expect(page.locator("#title")).toHaveText(config.title);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.locator("#sample").click();
    await expect(page.locator(".record")).toHaveCount(config.sample.length);
    for (const f of config.fields) {
      const input = page.locator(`#field-${f.key}`);
      if (f.type === "checkbox") continue;
      if (f.type === "select") await input.selectOption(f.choices[0]);
      else
        await input.fill(
          String(
            f.key === "item"
              ? "QA carry case"
              : f.key === "project"
                ? "QA cabinet"
                : f.type === "number"
                  ? 99
                  : config.sample[0][f.key] || "QA notes",
          ),
        );
    }
    await page.locator("#files").setInputFiles({
      name: "reference.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(page.locator("#message")).toContainText("Attachments ready");
    if (config.allowPdf) {
      await page.locator("#files").setInputFiles({
        name: "receipt.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(
          "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF",
        ),
      });
      await expect(page.locator("#save")).toBeEnabled();
    }
    await page.locator("#save").click();
    await expect(page.locator(".record")).toHaveCount(config.sample.length + 1);
    await page.reload();
    await expect(page.locator(".record")).toHaveCount(config.sample.length + 1);
    await page.locator("#search").fill("QA carry");
    await expect(page.locator(".record")).toHaveCount(1);
    await expect(page.locator(".record img")).toHaveCount(1);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#export").click(),
    ]);
    const content = JSON.parse(readFileSync(await download.path(), "utf8"));
    expect(content.records).toHaveLength(config.sample.length + 1);
    expect(
      content.records.find((r) => r.item === "QA carry case").attachments,
    ).toHaveLength(config.allowPdf ? 2 : 1);
    if (config.allowPdf) {
      const [receipt] = await Promise.all([
        page.waitForEvent("download"),
        page.locator(".record a").filter({ hasText: "receipt.pdf" }).click(),
      ]);
      expect(readFileSync(await receipt.path(), "utf8")).toContain("%PDF-1.4");
    }
    await page.locator(".record button").filter({ hasText: "Edit" }).click();
    await page.locator("#field-item").fill("Changed item");
    await page.locator("#save").click();
    await expect(page.locator(".record")).toHaveCount(0);
    await page.locator("#import-file").setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(content)),
    });
    await expect(page.locator("#import-dialog")).toBeVisible();
    await page.locator("#cancel-import").click();
    expect(
      await page.evaluate((k) => localStorage.getItem(k), storageKey),
    ).toContain("Changed item");
    await page.locator("#import-file").setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(content)),
    });
    await page.locator("#apply-import").click();
    await expect(page.locator(".record")).toHaveCount(1);
    await page
      .locator(".record button")
      .filter({ hasText: /Mark returned|Mark dropped off|Mark reassembled/ })
      .click();
    await page.locator("#status-filter").selectOption("done");
    await expect(page.locator(".record")).toHaveCount(1);
    await page.evaluate(() => {
      window.print = () => {
        window.__printCalled = true;
      };
    });
    await page.locator("#print-sheet").click();
    expect(await page.evaluate(() => window.__printCalled)).toBeTruthy();
    await expect(page.locator("#print-output")).toContainText("QA carry case");
    if (config.slug === "furniture-hardware-labels") {
      await page.locator("#print-labels").click();
      await expect(page.locator("#print-output")).toContainText("Bag 99");
    }
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("#print-output")).toBeVisible();
    if (browserName === "chromium")
      await page.pdf({
        path: testInfo.outputPath(`${mode}-print.pdf`),
        format: "A4",
        printBackground: true,
      });
    await page.emulateMedia({ media: "screen" });
    await page.screenshot({
      path: testInfo.outputPath(`${mode}-390px.png`),
      fullPage: true,
    });
    await page.locator("#search").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#status-filter")).toBeFocused();
    await page.setViewportSize({ width: 1360, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: testInfo.outputPath(`${mode}-desktop.png`),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });

  test(`${mode}: malformed storage recovery and invalid imports preserve bytes`, async ({
    page,
  }) => {
    await page.goto(url());
    await page.evaluate(
      (k) => localStorage.setItem(k, "{broken storage"),
      storageKey,
    );
    await page.reload();
    await expect(page.locator("#recovery")).toBeVisible();
    const [raw] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#raw-export").click(),
    ]);
    expect(readFileSync(await raw.path(), "utf8")).toBe("{broken storage");
    await page.locator("#import-file").setInputFiles({
      name: "invalid.json",
      mimeType: "application/json",
      buffer: Buffer.from("{invalid"),
    });
    await expect(page.locator("#message")).toContainText("not readable JSON");
    expect(
      await page.evaluate((k) => localStorage.getItem(k), storageKey),
    ).toBe("{broken storage");
    await page.locator("#import-file").setInputFiles({
      name: "recovery.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup("Recovered item"))),
    });
    await page.locator("#cancel-import").click();
    expect(
      await page.evaluate((k) => localStorage.getItem(k), storageKey),
    ).toBe("{broken storage");
    await page.locator("#import-file").setInputFiles({
      name: "recovery.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup("Recovered item"))),
    });
    await page.locator("#apply-import").click();
    await page.reload();
    await expect(page.locator(".record")).toContainText("Recovered item");
    await expect(page.locator("#recovery")).toBeHidden();
  });

  test(`${mode}: slow earlier import cannot replace the later selection`, async ({
    page,
  }) => {
    await page.goto(url());
    await page.evaluate(() => {
      const text = File.prototype.text;
      File.prototype.text = async function () {
        if (this.name === "slow.json")
          await new Promise((r) => setTimeout(r, 600));
        return text.call(this);
      };
    });
    await page.locator("#import-file").setInputFiles({
      name: "slow.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup("Earlier item"))),
    });
    await page.locator("#import-file").setInputFiles({
      name: "latest.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup("Latest item"))),
    });
    await expect(page.locator("#import-dialog")).toBeVisible();
    await page.waitForTimeout(750);
    await page.locator("#apply-import").click();
    await expect(page.locator(".record")).toContainText("Latest item");
    expect(
      await page.evaluate((k) => localStorage.getItem(k), storageKey),
    ).not.toContain("Earlier item");
  });
}

test("source: storage quota and a second-tab write refuse destructive saves", async ({
  page,
  context,
}) => {
  const url = `${origin}/source/index.html`;
  await page.goto(url);
  await page.locator("#sample").click();
  const initial = await page.evaluate(
    (k) => localStorage.getItem(k),
    storageKey,
  );
  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("full", "QuotaExceededError");
    };
  });
  await page
    .locator(".record")
    .first()
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.locator("#field-item").fill("Quota failure edit");
  await page.locator("#save").click();
  await expect(page.locator("#message")).toContainText(
    "previous saved data is unchanged",
  );
  expect(await page.evaluate((k) => localStorage.getItem(k), storageKey)).toBe(
    initial,
  );
  await expect(page.locator("#field-item")).toHaveValue("Quota failure edit");
  await page.reload();
  const second = await context.newPage();
  await second.goto(url);
  await second.evaluate(
    (k) => localStorage.setItem(k, "{another tab changed this"),
    storageKey,
  );
  await second.close();
  await expect(page.locator("#message")).toContainText("another tab");
  await page
    .locator(".record")
    .first()
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.locator("#save").click();
  expect(await page.evaluate((k) => localStorage.getItem(k), storageKey)).toBe(
    "{another tab changed this",
  );
});

test("source: removing a photo cancels an earlier in-flight attachment selection", async ({
  page,
}) => {
  await page.goto(`${origin}/source/index.html`);
  await page.locator("#sample").click();
  await page
    .locator(".record")
    .first()
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.locator("#files").setInputFiles({
    name: "original.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page.locator("#message")).toContainText("Attachments ready");
  await page.locator("#save").click();
  await page
    .locator(".record")
    .first()
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.evaluate(() => {
    const read = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (file) {
      setTimeout(() => read.call(this, file), 600);
    };
  });
  await page
    .locator("#files")
    .setInputFiles({ name: "new.png", mimeType: "image/png", buffer: png });
  await page
    .locator("#attachment-preview")
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await page.waitForTimeout(800);
  await expect(page.locator("#attachment-preview img")).toHaveCount(0);
  await expect(page.locator("#save")).toBeEnabled();
  await page.locator("#save").click();
  const saved = JSON.parse(
    await page.evaluate((k) => localStorage.getItem(k), storageKey),
  );
  expect(saved.records[0].attachments).toHaveLength(0);
});

test("source: imported image must decode before replacement preview", async ({
  page,
}) => {
  await page.goto(`${origin}/source/index.html`);
  await page.locator("#sample").click();
  const initial = await page.evaluate(
    (k) => localStorage.getItem(k),
    storageKey,
  );
  const invalid = backup("Broken photo");
  invalid.records[0].attachments = [
    {
      name: "truncated.png",
      type: "image/png",
      data: "data:image/png;base64," + png.subarray(0, 33).toString("base64"),
    },
  ];
  await page.locator("#import-file").setInputFiles({
    name: "broken-image.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await expect(page.locator("#message")).toContainText("cannot be decoded");
  await expect(page.locator("#import-dialog")).toBeHidden();
  expect(await page.evaluate((k) => localStorage.getItem(k), storageKey)).toBe(
    initial,
  );
});

test("source: toggling the edited record preserves the saved status when editing notes", async ({
  page,
}) => {
  await page.goto(`${origin}/source/index.html`);
  await page.locator("#sample").click();
  const card = page.locator(".record").first();
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  await page.locator("#field-notes").fill("An unsaved note to retain.");
  await card
    .getByRole("button", {
      name: /Mark returned|Mark dropped off|Mark reassembled/,
    })
    .click();
  await expect(page.locator("#field-done")).toBeChecked();
  await expect(page.locator("#field-notes")).toHaveValue(
    "An unsaved note to retain.",
  );
  await page.locator("#save").click();
  const saved = JSON.parse(
    await page.evaluate((k) => localStorage.getItem(k), storageKey),
  );
  expect(saved.records[0].done).toBe(true);
  expect(saved.records[0].notes).toBe("An unsaved note to retain.");
});

test("source: long accepted identifiers wrap inside printable sheets and labels", async ({
  page,
}) => {
  await page.goto(`${origin}/source/index.html`);
  const content = backup("X".repeat(120));
  if (config.slug === "furniture-hardware-labels")
    content.records[0].project = "Y".repeat(120);
  await page.locator("#import-file").setInputFiles({
    name: "long-names.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(content)),
  });
  await page.locator("#apply-import").click();
  await page.evaluate(() => {
    window.print = () => {};
  });
  for (const button of config.slug === "furniture-hardware-labels"
    ? ["#print-sheet", "#print-labels"]
    : ["#print-sheet"]) {
    await page.emulateMedia({ media: "screen" });
    await page.locator(button).click();
    await page.emulateMedia({ media: "print" });
    expect(
      await page
        .locator(".print-record")
        .evaluateAll((cards) =>
          cards.every((card) => card.scrollWidth <= card.clientWidth + 1),
        ),
    ).toBeTruthy();
  }
});
