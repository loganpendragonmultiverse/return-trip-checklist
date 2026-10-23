import { config } from "./config.js";
import {
  createStore,
  emptyBackup,
  parseBackup,
  validateBackup,
  validateAttachment,
  filterRecords,
  todayLocal,
  MAX_BACKUP_BYTES,
} from "./core.js";
const $ = (id) => document.getElementById(id);
const node = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
let store,
  records = [],
  editing = null,
  attachments = [],
  undo = null,
  pending = null,
  dirty = false,
  stale = false,
  importTicket = 0,
  editorTicket = 0,
  readingFiles = false;
try {
  store = createStore(localStorage);
} catch {
  store = createStore({
    getItem() {
      throw Error("Browser storage is unavailable.");
    },
    setItem() {
      throw Error("Browser storage is unavailable.");
    },
  });
}
records = store.data.records;
document.title = config.title;
document.documentElement.style.setProperty("--accent", config.accent);
$("title").textContent = config.title;
$("tagline").textContent = config.tagline;
$("intro").textContent = config.intro;
$("limit").textContent = config.limitations;
$("form-title").textContent = `Add ${config.noun}`;
$("attachment-label").textContent = config.attachmentLabel;
$("attachment-hint").textContent =
  `Up to ${config.maxAttachments} ${config.allowPdf ? "PNG/JPEG/WebP images or PDF receipts" : "PNG/JPEG/WebP images"}. Images ≤ 1 MB${config.allowPdf ? "; PDFs ≤ 2 MB" : ""}. Files stay in this browser and your backups.`;
$("files").accept = config.allowPdf
  ? "image/png,image/jpeg,image/webp,application/pdf"
  : "image/png,image/jpeg,image/webp";
$("files").multiple = config.maxAttachments > 1;
$("print-sheet").textContent = config.printButton;
$("print-labels").hidden = config.slug !== "furniture-hardware-labels";
function status(message, error = false) {
  $("message").textContent = message;
  $("message").className = error ? "notice error" : "notice";
  $("message").hidden = false;
}
function id() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `r-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
function field(f) {
  const wrap = node(
    "div",
    undefined,
    f.type === "checkbox" ? "check-field" : "field",
  );
  const label = node("label", f.label + (f.required ? " *" : ""));
  label.htmlFor = `field-${f.key}`;
  let input;
  if (f.type === "textarea") input = node("textarea");
  else if (f.type === "select") {
    input = node("select");
    f.choices.forEach((x) => {
      const o = node("option", x);
      o.value = x;
      input.append(o);
    });
  } else {
    input = node("input");
    input.type =
      f.type === "checkbox"
        ? "checkbox"
        : f.type === "number"
          ? "number"
          : f.type === "date"
            ? "date"
            : "text";
  }
  input.id = `field-${f.key}`;
  input.name = f.key;
  input.required = !!f.required;
  if (f.max && f.type !== "number") input.maxLength = f.max;
  if (f.placeholder) input.placeholder = f.placeholder;
  if (f.type === "number") {
    input.min = f.min;
    input.max = f.max;
    input.step = 1;
  }
  if (f.type === "date") {
    input.min = "0001-01-01";
    input.max = "9999-12-31";
  }
  if (f.type === "textarea") input.rows = 3;
  wrap.append(label, input);
  $("fields").append(wrap);
}
config.fields.forEach(field);
function download(content, name, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = node("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportBackup() {
  if (store.fault) {
    status(
      "Saved data is unreadable. Use Export original storage to preserve it, then import a valid backup.",
      true,
    );
    return;
  }
  download(
    JSON.stringify({ format: config.slug, version: 1, records }),
    `${config.slug}-${todayLocal()}.json`,
  );
  status("Backup downloaded. Keep it somewhere outside this browser.");
}
function renderAttachments(list, target, editable = false) {
  target.replaceChildren();
  list.forEach((a, i) => {
    const box = node("div", undefined, "attachment");
    if (a.type.startsWith("image/")) {
      const img = node("img");
      img.src = a.data;
      img.alt = a.name;
      img.loading = "lazy";
      box.append(img);
    } else box.append(node("span", "PDF receipt", "pdf-badge"));
    const link = node("a", a.name);
    link.href = a.data;
    link.download = a.name;
    link.className = "attachment-link";
    box.append(link);
    if (editable) {
      const b = node("button", "Remove", "small secondary");
      b.type = "button";
      b.addEventListener("click", () => {
        const cancelled = readingFiles;
        editorTicket++;
        readingFiles = false;
        $("save").disabled = false;
        $("files").value = "";
        attachments.splice(i, 1);
        dirty = true;
        renderAttachments(attachments, target, true);
        status(
          cancelled
            ? "Attachment removed. The pending file selection was cancelled; select it again if needed."
            : "Attachment removed. Save the record to keep this change.",
        );
      });
      box.append(b);
    }
    target.append(box);
  });
}
async function checkDecodedImages(candidate) {
  for (const r of candidate.records)
    for (const a of r.attachments)
      if (a.type.startsWith("image/"))
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () =>
            img.naturalWidth * img.naturalHeight > 25_000_000
              ? reject(Error("An imported image exceeds 25 million pixels."))
              : resolve();
          img.onerror = () =>
            reject(
              Error(
                "An imported image cannot be decoded. Nothing was changed.",
              ),
            );
          img.src = a.data;
        });
}
function setEditor(r) {
  editorTicket++;
  readingFiles = false;
  $("save").disabled = false;
  editing = r?.id || null;
  config.fields.forEach((f) => {
    const input = $(`field-${f.key}`);
    if (f.type === "checkbox") input.checked = r?.[f.key] || false;
    else input.value = r?.[f.key] ?? (f.type === "select" ? f.choices[0] : "");
  });
  attachments = structuredClone(r?.attachments || []);
  renderAttachments(attachments, $("attachment-preview"), true);
  $("form-title").textContent = editing
    ? `Edit ${config.noun}`
    : `Add ${config.noun}`;
  $("save").textContent = editing ? "Save changes" : `Add ${config.noun}`;
  $("cancel-edit").hidden = !editing;
  dirty = false;
  $("files").value = "";
}
function update(next, msg, options) {
  if (stale)
    throw new Error(
      "Another tab changed saved data. Copy any unsaved form details and retain original attachment files before reloading. Notebook backups contain saved records only.",
    );
  const previous = store.data;
  store.commit({ format: config.slug, version: 1, records: next }, options);
  undo = store.fault ? null : previous;
  records = store.data.records;
  $("undo").disabled = !undo;
  render();
  status(msg);
}
function render() {
  const shown = filterRecords(
    records,
    $("search").value,
    $("status-filter").value,
  );
  $("count").textContent =
    `${records.filter((r) => !r.done).length} active · ${records.length} total`;
  $("results-count").textContent =
    `${shown.length} ${shown.length === 1 ? config.noun : config.plural} shown`;
  const target = $("records");
  target.replaceChildren();
  $("empty").hidden = shown.length !== 0;
  $("empty-title").textContent = records.length
    ? "No matches"
    : "Start with one " + config.noun;
  $("empty-text").textContent = records.length
    ? "Try a different search or status filter."
    : `Add the details at the left, or load the example to explore before using your own information.`;
  shown.forEach((r) => {
    const card = node("article", undefined, "record");
    const head = node("div", undefined, "record-head");
    const title = node(
      "h3",
      config.slug === "furniture-hardware-labels"
        ? `${r.project} · Bag ${r.bag}`
        : r.item,
    );
    head.append(
      title,
      node(
        "span",
        r.done
          ? config.slug === "return-trip-checklist"
            ? "Dropped off"
            : config.slug === "furniture-hardware-labels"
              ? "Reassembled"
              : "Returned"
          : "Active",
        r.done ? "badge done" : "badge",
      ),
    );
    card.append(head);
    if (config.slug === "furniture-hardware-labels")
      card.append(
        node(
          "p",
          `${r.item} · ${r.quantity} pieces · Step ${r.order}`,
          "strong",
        ),
      );
    config.fields
      .filter(
        (f) =>
          f.key !== "done" &&
          f.key !== "item" &&
          !(
            config.slug === "furniture-hardware-labels" &&
            ["project", "bag", "quantity", "order"].includes(f.key)
          ),
      )
      .forEach((f) => {
        const value = r[f.key];
        if (value === "" || value === false) return;
        const row = node("p", undefined, "detail");
        row.append(
          node("strong", `${f.label}: `),
          node("span", f.type === "checkbox" ? "Ready" : String(value)),
        );
        card.append(row);
      });
    if (r.date && !r.done && r.date < todayLocal())
      card.append(
        node(
          "p",
          config.slug === "return-trip-checklist"
            ? "The deadline you entered has passed. Check the retailer’s instructions."
            : "Past the agreed return date.",
          "date-note",
        ),
      );
    if (r.attachments.length) {
      const group = node("div", undefined, "attachments");
      renderAttachments(r.attachments, group);
      card.append(group);
    }
    const actions = node("div", undefined, "card-actions");
    const edit = node("button", "Edit", "secondary small");
    edit.addEventListener("click", () => {
      if (dirty && !confirm("Discard unsaved form changes?")) return;
      setEditor(r);
      $("editor").scrollIntoView({ behavior: "smooth", block: "start" });
      $(`field-${config.fields[0].key}`).focus();
    });
    const toggle = node(
      "button",
      r.done
        ? "Mark active"
        : config.slug === "return-trip-checklist"
          ? "Mark dropped off"
          : config.slug === "furniture-hardware-labels"
            ? "Mark reassembled"
            : "Mark returned",
      "secondary small",
    );
    toggle.addEventListener("click", () => {
      try {
        const nextDone = !r.done;
        update(
          records.map((x) => (x.id === r.id ? { ...x, done: nextDone } : x)),
          "Status saved.",
        );
        if (editing === r.id) $("field-done").checked = nextDone;
      } catch (e) {
        status(e.message, true);
      }
    });
    const del = node("button", "Delete", "danger small");
    del.addEventListener("click", () => {
      if (
        !confirm(
          `Delete ${r.item}${r.project ? " from " + r.project : ""}? You can undo until your next change or reload.`,
        )
      )
        return;
      try {
        update(
          records.filter((x) => x.id !== r.id),
          "Deleted. Undo is available until the next change or reload.",
        );
        if (editing === r.id) setEditor(null);
      } catch (e) {
        status(e.message, true);
      }
    });
    actions.append(edit, toggle, del);
    card.append(actions);
    target.append(card);
  });
  $("print-sheet").disabled = shown.length === 0;
  $("print-labels").disabled = shown.length === 0;
  $("delete-all").disabled = records.length === 0 || !!store.fault;
  $("export").disabled = !!store.fault;
}
function print(mode) {
  const shown = filterRecords(
    records,
    $("search").value,
    $("status-filter").value,
  );
  if (!shown.length) return;
  const root = $("print-output");
  root.replaceChildren(
    node("h1", mode === "labels" ? "Hardware bag labels" : config.printTitle),
    node(
      "p",
      `${config.title} · ${todayLocal()} · ${shown.length} record(s)`,
      "print-meta",
    ),
  );
  root.className = mode === "labels" ? "labels" : "sheet";
  shown.forEach((r) => {
    const card = node("article", undefined, "print-record");
    card.append(
      node(
        "h2",
        config.slug === "furniture-hardware-labels"
          ? `${r.project} · Bag ${r.bag}`
          : r.item,
      ),
    );
    if (mode === "labels") {
      card.append(
        node("p", r.item),
        node("p", `${r.quantity} pieces · Reassembly step ${r.order}`),
      );
    } else {
      for (const f of config.fields) {
        const v = r[f.key];
        if (v === "") continue;
        const row = node("p", undefined, "print-detail");
        row.append(
          node("strong", `${f.label}: `),
          node(
            "span",
            f.type === "checkbox" ? (v ? "☑ Yes" : "☐ Not yet") : String(v),
          ),
        );
        card.append(row);
      }
      if (r.attachments.length) {
        const photos = node("div", undefined, "print-photos");
        for (const a of r.attachments) {
          if (a.type.startsWith("image/")) {
            const img = node("img");
            img.src = a.data;
            img.alt = a.name;
            photos.append(img);
          } else
            photos.append(
              node(
                "p",
                `PDF receipt saved in backup: ${a.name}. Print it separately if required.`,
              ),
            );
        }
        card.append(photos);
      }
    }
    root.append(card);
  });
  root.append(node("p", config.limitations, "print-note"));
  window.print();
}
$("form").addEventListener("input", () => (dirty = true));
$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (readingFiles) {
    status("Wait for attachments to finish reading before saving.", true);
    return;
  }
  if (store.fault) {
    status(
      "Saved data needs recovery before editing. Export original storage, then import a valid backup.",
      true,
    );
    return;
  }
  const r = { id: editing || id() };
  config.fields.forEach((f) => {
    const input = $(`field-${f.key}`);
    r[f.key] =
      f.type === "checkbox"
        ? input.checked
        : f.type === "number"
          ? Number(input.value)
          : input.value.trim();
  });
  r.attachments = structuredClone(attachments);
  const next = editing
    ? records.map((x) => (x.id === editing ? r : x))
    : [...records, r];
  try {
    validateBackup({ format: config.slug, version: 1, records: next });
    update(
      next,
      editing
        ? "Changes saved."
        : `${config.noun[0].toUpperCase() + config.noun.slice(1)} added.`,
    );
    setEditor(null);
  } catch (error) {
    status(error.message, true);
  }
});
$("files").addEventListener("change", async () => {
  const files = [...$("files").files];
  if (!files.length) return;
  const before = structuredClone(attachments),
    ticket = ++editorTicket;
  readingFiles = true;
  $("save").disabled = true;
  try {
    if (attachments.length + files.length > config.maxAttachments)
      throw Error(
        `Choose at most ${config.maxAttachments} attachment(s) in total.`,
      );
    const added = [];
    for (const file of files) {
      if (file.size > (file.type === "application/pdf" ? 2_000_000 : 1_000_000))
        throw Error("Images must be at most 1 MB; PDFs at most 2 MB.");
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(Error("This file could not be read."));
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      const a = { name: file.name, type: file.type, data };
      validateAttachment(a);
      if (file.type.startsWith("image/"))
        await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () =>
            img.naturalWidth * img.naturalHeight > 25_000_000
              ? reject(Error("Choose an image smaller than 25 million pixels."))
              : resolve();
          img.onerror = () =>
            reject(
              Error(
                "The image could not be decoded. Choose a valid PNG, JPEG or WebP.",
              ),
            );
          img.src = data;
        });
      added.push(a);
    }
    if (ticket !== editorTicket) return;
    attachments = [...before, ...added];
    dirty = true;
    renderAttachments(attachments, $("attachment-preview"), true);
    status("Attachments ready. Save the record to keep them.");
  } catch (e) {
    if (ticket === editorTicket) status(e.message, true);
  } finally {
    if (ticket === editorTicket) {
      readingFiles = false;
      $("save").disabled = false;
      $("files").value = "";
    }
  }
});
$("cancel-edit").addEventListener("click", () => {
  if (dirty && !confirm("Discard unsaved form changes?")) return;
  setEditor(null);
});
$("clear-form").addEventListener("click", () => {
  if (dirty && !confirm("Discard unsaved form changes?")) return;
  setEditor(null);
});
$("export").addEventListener("click", exportBackup);
$("raw-export").addEventListener("click", () => {
  if (store.raw !== null)
    download(store.raw, `${config.slug}-original-storage.txt`, "text/plain");
  else status("No readable original storage bytes are available.", true);
});
$("import-file").addEventListener("change", async () => {
  const file = $("import-file").files[0];
  if (!file) return;
  const ticket = ++importTicket;
  pending = null;
  $("import-error").textContent = "";
  if ($("import-dialog").open) $("import-dialog").close();
  try {
    if (file.size > MAX_BACKUP_BYTES)
      throw Error("Choose a backup no larger than 4.5 MB.");
    const candidate = parseBackup(await file.text());
    if (ticket !== importTicket) return;
    await checkDecodedImages(candidate);
    if (ticket !== importTicket) return;
    pending = candidate;
    $("import-summary").textContent =
      `This backup contains ${pending.records.length} ${config.plural}. Applying it replaces ${records.length} currently loaded record(s), including attachments, and clears unsaved form edits. Export your current backup first if you need to keep it.${store.fault ? " This is explicit recovery of unreadable storage. Export its original bytes before continuing." : ""}`;
    $("import-dialog").showModal();
  } catch (e) {
    if (ticket === importTicket) {
      pending = null;
      status(e.message, true);
    }
  } finally {
    if (ticket === importTicket) $("import-file").value = "";
  }
});
$("apply-import").addEventListener("click", () => {
  if (!pending) return;
  try {
    const recovering = !!store.fault;
    update(pending.records, "Backup imported and saved.", {
      recover: recovering,
    });
    if (recovering) {
      undo = null;
      $("undo").disabled = true;
      $("recovery").hidden = true;
    }
    pending = null;
    $("import-dialog").close();
    setEditor(null);
  } catch (e) {
    $("import-error").textContent = e.message;
  }
});
$("cancel-import").addEventListener("click", () => {
  importTicket++;
  pending = null;
  $("import-dialog").close();
  $("import-error").textContent = "";
});
$("import-dialog").addEventListener("cancel", () => {
  importTicket++;
  pending = null;
  $("import-error").textContent = "";
});
$("undo").addEventListener("click", () => {
  if (!undo) return;
  if (
    dirty &&
    !confirm("Discard unsaved form edits and undo the last saved change?")
  )
    return;
  try {
    store.commit(undo);
    records = store.data.records;
    undo = null;
    $("undo").disabled = true;
    render();
    setEditor(null);
    status("Previous saved state restored.");
  } catch (e) {
    status(e.message, true);
  }
});
$("sample").addEventListener("click", () => {
  if (store.fault) {
    status("Recover saved data before loading examples.", true);
    return;
  }
  if (
    records.length &&
    !confirm("Add example records to your existing notebook?")
  )
    return;
  try {
    update(
      [
        ...records,
        ...config.sample.map((r) => ({ ...r, id: id(), attachments: [] })),
      ],
      "Example records added. Edit or delete them when you are ready.",
    );
  } catch (e) {
    status(e.message, true);
  }
});
$("delete-all").addEventListener("click", () => {
  if (
    !confirm(
      `Delete every ${config.noun}? Export a backup first. Undo lasts only until the next change or reload.`,
    )
  )
    return;
  try {
    update([], "All records deleted. Undo is available.");
    setEditor(null);
  } catch (e) {
    status(e.message, true);
  }
});
$("search").addEventListener("input", render);
$("status-filter").addEventListener("change", render);
$("print-sheet").addEventListener("click", () => print("sheet"));
$("print-labels").addEventListener("click", () => print("labels"));
window.addEventListener("storage", (e) => {
  if (e.key === null || e.key === "" + config.slug + ":v1") {
    stale = true;
    status(
      "Saved data changed in another tab. Copy any unsaved form details and retain original attachment files before reloading. Notebook backups contain saved records only.",
      true,
    );
  }
});
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
setEditor(null);
render();
if (store.fault) {
  $("recovery").hidden = false;
  $("recovery-message").textContent = store.fault;
  status(
    "Saved data could not be read. It has not been replaced. Use the recovery controls below.",
    true,
  );
}
