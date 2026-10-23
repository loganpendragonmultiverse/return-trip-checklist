import test from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.js";
import {
  emptyBackup,
  validateBackup,
  parseBackup,
  validDate,
  createStore,
  STORAGE_KEY,
  validateAttachment,
  filterRecords,
} from "../src/core.js";
function sample() {
  return {
    format: config.slug,
    version: 1,
    records: config.sample.map((r, i) => ({
      ...r,
      id: `fixture-${i}`,
      attachments: [],
    })),
  };
}
function memory(raw = null) {
  return {
    raw,
    getItem() {
      return this.raw;
    },
    setItem(k, v) {
      assert.equal(k, STORAGE_KEY);
      this.raw = v;
    },
  };
}
test("example round trips as a portable backup without changing supplied text", () => {
  const b = sample();
  assert.deepEqual(parseBackup(JSON.stringify(b)), b);
});
test("dates reject rollover and non-date strings, preserve leap day and four-digit years", () => {
  assert.ok(validDate("2024-02-29"));
  assert.ok(validDate("0001-01-01"));
  for (const x of [
    "2023-02-29",
    "2026-04-31",
    "2026-2-01",
    "0000-01-01",
    "2026-01-01T00:00:00Z",
  ])
    assert.equal(validDate(x), false);
});
test("imports reject wrong product, unknown fields, duplicate IDs, typed confusion and oversized text", () => {
  let b = sample();
  b.format = "other";
  assert.throws(() => validateBackup(b));
  b = sample();
  b.records[0].unknown = true;
  assert.throws(() => validateBackup(b));
  b = sample();
  b.records.push(structuredClone(b.records[0]));
  assert.throws(() => validateBackup(b));
  b = sample();
  b.records[0].done = "false";
  assert.throws(() => validateBackup(b));
  b = sample();
  b.records[0].item = "x".repeat(121);
  assert.throws(() => validateBackup(b));
});
test("malformed and oversized backup bytes fail before storage work", () => {
  assert.throws(() => parseBackup("{"));
  assert.throws(() => parseBackup(" ".repeat(4_500_001)));
  assert.throws(() => parseBackup("null"));
});
test("normal save is atomic from application perspective and stale tab cannot overwrite", () => {
  const m = memory();
  const a = createStore(m),
    b = createStore(m);
  a.commit(sample());
  assert.deepEqual(a.data, sample());
  assert.throws(() => b.commit(emptyBackup()), /another tab/);
  assert.deepEqual(JSON.parse(m.raw), sample());
});
test("storage quota failure retains last good state and original raw data", () => {
  const original = JSON.stringify(sample());
  const m = memory(original);
  m.setItem = () => {
    throw Error("QuotaExceededError");
  };
  const s = createStore(m);
  assert.throws(
    () => s.commit(emptyBackup()),
    /previous saved data is unchanged/,
  );
  assert.deepEqual(s.data, sample());
  assert.equal(s.raw, original);
  assert.equal(m.raw, original);
});
test("unreadable storage remains byte-identical until explicit valid recovery", () => {
  const raw = "{not a notebook";
  const m = memory(raw);
  const s = createStore(m);
  assert.ok(s.fault);
  assert.equal(s.raw, raw);
  assert.throws(() => s.commit(emptyBackup()), /unreadable/);
  assert.equal(m.raw, raw);
  s.commit(sample(), { recover: true });
  assert.equal(s.fault, null);
  assert.deepEqual(JSON.parse(m.raw), sample());
});
test("stale external writes are blocked even during unreadable-data recovery", () => {
  const m = memory("{bad");
  const s = createStore(m);
  m.raw = "changed";
  assert.throws(() => s.commit(sample(), { recover: true }), /another tab/);
  assert.equal(m.raw, "changed");
});
test("attachment policy rejects SVG, mismatched signatures, invalid base64, missing dimensions and extra fields", () => {
  for (const a of [
    {
      name: "x.svg",
      type: "image/svg+xml",
      data: "data:image/svg+xml;base64,PHN2Zz4=",
    },
    {
      name: "x.png",
      type: "image/png",
      data: "data:image/png;base64,SGVsbG8=",
    },
    { name: "x.png", type: "image/png", data: "data:image/png;base64,@@@=" },
    {
      name: "x.png",
      type: "image/png",
      data: "data:image/png;base64,iVBORw0KGgo=",
    },
    {
      name: "x.png",
      type: "image/png",
      data: "data:image/png;base64,iVBORw0KGgo=",
      extra: true,
    },
  ])
    assert.throws(() => validateAttachment(a));
  assert.doesNotThrow(() =>
    validateAttachment({
      name: "fixture.png",
      type: "image/png",
      data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aA9sAAAAASUVORK5CYII=",
    }),
  );
});
test("image dimensions are bounded before browser decoding", () => {
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aA9sAAAAASUVORK5CYII=",
    "base64",
  );
  bytes.writeUInt32BE(50000, 16);
  bytes.writeUInt32BE(50000, 20);
  assert.throws(
    () =>
      validateAttachment({
        name: "huge.png",
        type: "image/png",
        data: "data:image/png;base64," + bytes.toString("base64"),
      }),
    /25 million/,
  );
});
test("search includes supplied details and completion filters", () => {
  const b = sample();
  b.records[0].notes = "Unique cabinet marker";
  assert.equal(filterRecords(b.records, "CABINET", "active").length, 1);
  assert.equal(filterRecords(b.records, "CABINET", "done").length, 0);
  b.records[0].done = true;
  assert.equal(filterRecords(b.records, "CABINET", "done").length, 1);
});
test("blank required names and invalid numeric or select fields fail", () => {
  const b = sample();
  const f = config.fields.find(
    (x) => x.required && (!x.type || x.type === "text"),
  );
  b.records[0][f.key] = "   ";
  assert.throws(() => validateBackup(b));
  for (const field of config.fields.filter(
    (x) => x.type === "number" || x.type === "select",
  )) {
    const c = sample();
    c.records[0][field.key] = field.type === "number" ? true : "unexpected";
    assert.throws(() => validateBackup(c));
  }
});
if (config.slug === "furniture-hardware-labels")
  test("normalised project bag uniqueness prevents ambiguous matching labels", () => {
    const b = sample();
    b.records[1].bag = b.records[0].bag;
    b.records[1].project = "  OAK BOOKCASE ";
    assert.throws(() => validateBackup(b), /unique within a project/);
  });

if (config.slug === "furniture-hardware-labels") {
  test("project aliases share one reassembly order and bag tie-break", () => {
    const b = sample();
    b.records[0].project = "Oak bookcase";
    b.records[0].order = 1;
    b.records[1].project = "  oak bookcase ";
    b.records[1].order = 2;
    assert.deepEqual(
      filterRecords(b.records).map((r) => r.order),
      [1, 2],
    );
    b.records[0].project = "Ｏａｋ bookcase";
    assert.deepEqual(
      filterRecords(b.records).map((r) => r.order),
      [1, 2],
    );
  });
  test("numeric bag number, quantity and reassembly step can be searched", () => {
    const b = sample();
    b.records[0].bag = 99;
    b.records[0].quantity = 71;
    b.records[0].order = 43;
    for (const query of ["99", "71", "43"])
      assert.equal(filterRecords(b.records, query).length, 1);
  });
}
