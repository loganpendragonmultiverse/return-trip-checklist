import { config } from "./config.js";
export const MAX_BACKUP_BYTES = 4_500_000;
export const MAX_RECORDS = 300;
export const STORAGE_KEY = `${config.slug}:v1`;
const projectKey = (value) =>
  value.trim().normalize("NFKC").toLocaleLowerCase("en");
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const plain = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const exact = (obj, keys) =>
  Object.keys(obj).length === keys.length && keys.every((k) => own(obj, k));
export function validDate(s) {
  if (
    typeof s !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    s < "0001-01-01" ||
    s > "9999-12-31"
  )
    return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear().toString().padStart(4, "0")}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}
function boundedText(value, max, label, required = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) ||
    (required && !value.trim())
  )
    throw new Error(
      `${label} must be ${required ? "nonblank " : ""}text, at most ${max} characters.`,
    );
}
export function validateAttachment(a) {
  if (!plain(a) || !exact(a, ["name", "type", "data"]))
    throw new Error("An attachment has an unsupported structure.");
  boundedText(a.name, 180, "Attachment name", true);
  const types = config.allowPdf
    ? ["image/png", "image/jpeg", "image/webp", "application/pdf"]
    : ["image/png", "image/jpeg", "image/webp"];
  if (!types.includes(a.type) || typeof a.data !== "string")
    throw new Error(
      "Use a PNG, JPEG or WebP image" +
        (config.allowPdf ? " or PDF receipt." : "."),
    );
  const prefix = `data:${a.type};base64,`;
  if (!a.data.startsWith(prefix))
    throw new Error("Attachment type and data do not agree.");
  const encoded = a.data.slice(prefix.length);
  if (
    !encoded ||
    encoded.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      encoded,
    )
  )
    throw new Error("Attachment data is not valid base64.");
  const bytes =
    (encoded.length / 4) * 3 -
    (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
  if (bytes > (a.type === "application/pdf" ? 2_000_000 : 1_000_000))
    throw new Error("Each image must be at most 1 MB; each PDF at most 2 MB.");
  let header;
  try {
    header = atob(encoded);
  } catch {
    throw new Error("Attachment data cannot be read.");
  }
  const valid =
    a.type === "image/png"
      ? header.startsWith("\x89PNG\r\n\x1a\n")
      : a.type === "image/jpeg"
        ? header.startsWith("\xff\xd8\xff")
        : a.type === "image/webp"
          ? header.startsWith("RIFF") && header.slice(8, 12) === "WEBP"
          : header.startsWith("%PDF-");
  if (!valid)
    throw new Error("Attachment bytes do not match the selected file type.");
  if (a.type.startsWith("image/")) {
    const byte = (i) => header.charCodeAt(i),
      u16 = (i) => (byte(i) << 8) | byte(i + 1),
      u32 = (i) =>
        byte(i) * 16777216 +
        byte(i + 1) * 65536 +
        byte(i + 2) * 256 +
        byte(i + 3);
    let width = 0,
      height = 0;
    if (
      a.type === "image/png" &&
      header.length >= 33 &&
      header.slice(12, 16) === "IHDR" &&
      u32(8) === 13
    ) {
      width = u32(16);
      height = u32(20);
    }
    if (a.type === "image/jpeg")
      for (let i = 2; i < header.length - 8;) {
        if (byte(i) !== 255) break;
        while (byte(i) === 255) i++;
        const marker = byte(i++);
        if (marker === 217 || marker === 218) break;
        if (marker === 216 || marker === 1 || (marker >= 208 && marker <= 215))
          continue;
        const length = u16(i);
        if (length < 2 || i + length > header.length) break;
        if (
          [
            192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
          ].includes(marker) &&
          length >= 8
        ) {
          height = u16(i + 3);
          width = u16(i + 5);
          break;
        }
        i += length;
      }
    if (a.type === "image/webp" && header.length >= 30) {
      const kind = header.slice(12, 16);
      if (kind === "VP8X") {
        width = 1 + byte(24) + byte(25) * 256 + byte(26) * 65536;
        height = 1 + byte(27) + byte(28) * 256 + byte(29) * 65536;
      } else if (kind === "VP8 " && header.slice(23, 26) === "\x9d\x01\x2a") {
        width = (byte(26) + byte(27) * 256) & 16383;
        height = (byte(28) + byte(29) * 256) & 16383;
      } else if (kind === "VP8L" && byte(20) === 47) {
        width = 1 + byte(21) + ((byte(22) & 63) << 8);
        height =
          1 + (byte(22) >> 6) + (byte(23) << 2) + ((byte(24) & 15) << 10);
      }
    }
    if (!width || !height || width * height > 25_000_000)
      throw new Error(
        "Choose a readable image smaller than 25 million pixels.",
      );
  }
  return a;
}
export function validateBackup(value) {
  if (
    !plain(value) ||
    !exact(value, ["format", "version", "records"]) ||
    value.format !== config.slug ||
    value.version !== 1 ||
    !Array.isArray(value.records) ||
    value.records.length > MAX_RECORDS
  )
    throw new Error(
      `Choose a version 1 ${config.title} backup with at most ${MAX_RECORDS} records.`,
    );
  const ids = new Set(),
    bags = new Set();
  for (const r of value.records) {
    if (
      !plain(r) ||
      !exact(r, ["id", ...config.fields.map((f) => f.key), "attachments"])
    )
      throw new Error("A record has missing or unrecognised fields.");
    if (
      typeof r.id !== "string" ||
      !/^[-a-zA-Z0-9]{1,80}$/.test(r.id) ||
      ids.has(r.id)
    )
      throw new Error("Record IDs must be unique and valid.");
    ids.add(r.id);
    for (const f of config.fields) {
      const v = r[f.key];
      if (f.type === "checkbox") {
        if (typeof v !== "boolean")
          throw new Error(`${f.label} must be true or false.`);
      } else if (f.type === "number") {
        if (!Number.isSafeInteger(v) || v < f.min || v > f.max)
          throw new Error(
            `${f.label} must be a whole number from ${f.min} to ${f.max}.`,
          );
      } else if (f.type === "select") {
        if (!f.choices.includes(v))
          throw new Error(`${f.label} has an unsupported choice.`);
      } else {
        boundedText(v, f.max, f.label, f.required);
        if (f.type === "date" && v !== "" && !validDate(v))
          throw new Error(`${f.label} must be a real date.`);
      }
    }
    if (
      !Array.isArray(r.attachments) ||
      r.attachments.length > config.maxAttachments
    )
      throw new Error(
        `Use at most ${config.maxAttachments} attachment(s) per ${config.noun}.`,
      );
    r.attachments.forEach(validateAttachment);
    if (config.slug === "furniture-hardware-labels") {
      const key = `${projectKey(r.project)}\0${r.bag}`;
      if (bags.has(key))
        throw new Error("Bag numbers must be unique within a project.");
      bags.add(key);
    }
  }
  if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_BACKUP_BYTES)
    throw new Error(
      "This notebook exceeds the 4.5 MB portable backup limit. Remove unneeded attachments after exporting a backup.",
    );
  return value;
}
export function emptyBackup() {
  return { format: config.slug, version: 1, records: [] };
}
export function parseBackup(raw) {
  if (
    typeof raw !== "string" ||
    new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES
  )
    throw new Error("Backup must be a JSON file no larger than 4.5 MB.");
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("This file is not readable JSON. Nothing was changed.");
  }
  return validateBackup(data);
}
export function createStore(storage) {
  let raw = null,
    data = emptyBackup(),
    fault = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
    if (raw !== null) data = parseBackup(raw);
  } catch (e) {
    fault = e.message;
  }
  return {
    get data() {
      return structuredClone(data);
    },
    get raw() {
      return raw;
    },
    get fault() {
      return fault;
    },
    commit(next, { recover = false } = {}) {
      validateBackup(next);
      if (fault && !recover)
        throw new Error(
          "Saved data is unreadable. Export its original bytes, then choose and confirm a valid backup to recover.",
        );
      let current;
      try {
        current = storage.getItem(STORAGE_KEY);
      } catch {
        throw new Error(
          "Browser storage cannot be read. Copy unsaved form details and retain original attachment files, then check browser storage settings. Backups contain saved records only.",
        );
      }
      if (current !== raw)
        throw new Error(
          "Saved data changed in another tab. Copy any unsaved form details and retain original attachment files before reloading. Notebook backups contain saved records only.",
        );
      const nextRaw = JSON.stringify(next);
      try {
        storage.setItem(STORAGE_KEY, nextRaw);
      } catch {
        throw new Error(
          "The browser could not save this change. Your previous saved data is unchanged. Free storage or export a backup before trying again.",
        );
      }
      raw = nextRaw;
      data = structuredClone(next);
      fault = null;
      return this.data;
    },
  };
}
export function sorted(records) {
  return [...records].sort(
    config.slug === "furniture-hardware-labels"
      ? (a, b) =>
          projectKey(a.project).localeCompare(projectKey(b.project)) ||
          a.order - b.order ||
          a.bag - b.bag
      : (a, b) =>
          Number(a.done) - Number(b.done) ||
          (a.date || "9999").localeCompare(b.date || "9999") ||
          a.item.localeCompare(b.item),
  );
}
export function filterRecords(records, query = "", status = "all") {
  const q = query.trim().toLocaleLowerCase();
  return sorted(
    records.filter(
      (r) =>
        (status === "all" || (status === "done") === r.done) &&
        config.fields.some(
          (f) =>
            ["string", "number"].includes(typeof r[f.key]) &&
            String(r[f.key]).toLocaleLowerCase().includes(q),
        ),
    ),
  );
}
