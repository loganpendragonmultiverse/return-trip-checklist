# Return Trip Checklist

Keep the receipt, deadline and drop-off details with a practical packing checklist. Tick off what is ready before you leave.

## Use it in three minutes

1. Extract the release ZIP and open `index.html` in a modern browser. The packaged page includes its scripts and styles and works without Internet access. If your browser restricts storage on file URLs, run `python -m http.server 8000` in the extracted folder and open `http://localhost:8000/` instead. Use the same browser and address to return to your records.
2. Add a return, fill in the required details and choose **Add return**. Attach PNG, JPEG or WebP photos and PDF receipt copies if useful. The form is saved only when you submit it.
3. Search or edit your records, choose the status filter and use **Print trip checklist**. Export a JSON backup before closing or moving to another device.

**Load example records** lets you explore with fictional details. `examples/notebook.json` is also a valid import. Delete examples when you are ready; deletion has confirmation and one-step undo.

## What is included

- Item to return
- Return deadline you were given
- Drop-off location
- Required packaging
- Accessories to include
- Instructions or reference
- Receipt / return reference ready
- Packaging ready
- Accessories packed
- Dropped off

- Search across your supplied text and filter active or completed records.
- Edit records and attachments, mark progress, and undo the last successful change until the next change or reload.
- Printable filtered sheets.
- Portable JSON backups with attachments included, explicit import preview and replacement confirmation.

## Privacy, storage and recovery

There are no accounts, analytics, third-party scripts, uploads or automatic messages. Runtime data stays in browser local storage and any backups you download. The source/help link is an ordinary external link you choose to open. Personal names, notes, photos and receipts are not encrypted or password protected. Anyone with access to this browser profile or your backup can read them.

Browser storage is device- and origin-specific, limited and subject to browser deletion, private-mode restrictions and storage policies. Moving or renaming an extracted page can change its storage origin. Export backups regularly; this app is not a durable file storage service. It accepts at most 300 records and 4.5 MB of serialised backup data. A browser may refuse a save before that limit. Each image is limited to 1 MB and each PDF to 2 MB; use smaller photos if storage fills.

Import validates the whole file before showing the replacement preview. Confirming replaces all currently saved records. Export the current backup first if you need both versions. A failed save leaves the previous stored state intact. Unreadable storage is preserved, normal saves are blocked, and **Export original storage** lets you retain the original bytes before explicitly importing a valid backup. Another tab changing storage blocks stale saves; Copy any unsaved form details and retain original attachment files before reloading. Notebook backups contain saved records only. Use one tab at a time.

Undo is in memory only and does not survive reload. Unsaved form edits are not part of the notebook backup. The browser asks before leaving a dirty form where supported. Keep original receipts and photos separately.

## Printing and limits

Print uses the current search and status filter. Check print preview, select paper size and save as PDF or print. Photos are included on sheets; attached PDF receipts must be downloaded and printed separately. Hardware labels, where available, use cut lines on ordinary paper, not a commercial label template. Browser print settings determine final pagination.

Deadlines and return requirements come from you. The app does not interpret store policies, read your inbox, contact retailers or arrange a return. Keep the original receipt; an attachment here is only a copy.

Attachments are selected explicitly. The app permits only bounded PNG/JPEG/WebP images and PDF receipts, checks their declared type and file signatures, and renders images as images. It does not sanitise PDF contents or act as an antivirus scanner. Open only documents you trust. SVG and HTML attachments are refused.

## Develop and verify

Clone the source repository to develop, or use the complete `source/` tree in the release ZIP. Use Node.js 22 or newer and Python 3 for ZIP packaging. There are no runtime dependencies. The offline ZIP has a directly openable page at its root and complete source, scripts, tests, lockfile and documentation in `source/`. Development commands below apply to the repository checkout or that extracted source directory.

```sh
npm test
npm run check
npm run build
python -m http.server 8000
```

Source modules need local HTTP when running unbuilt source. The release build in `dist/return-trip-checklist/index.html` is self-contained and can be opened directly. `dist/return-trip-checklist-1.0.0.zip` contains the page, readable source, license, usage and verification documents. `dist/SHA256SUMS` identifies the ZIP built locally. See [TESTING.md](TESTING.md) for the acceptance flows and remaining verification requirements.

## Project status and contributions

Version 1.0.0 implements the bounded job above. Independent release and Gold acceptance are tracked separately; a successful build alone is not a Gold assessment. Maintenance is discretionary. Report reproducible defects or focused improvements through this repository, and see [CONTRIBUTING.md](CONTRIBUTING.md) before sending changes.

MIT licensed. Copyright 2026 Logan Pendragon Multiverse.

## Development checks

Use Node.js 22 or newer and Python 3. Install development-only dependencies with `npm ci`, then run `npm test`, `npm run check` and `npm run build`. For browser acceptance, install the pinned test browsers with `npx playwright install chromium firefox webkit`, then run `npm run test:browser`. CI repeats source checks on Linux, Windows and macOS, and browser acceptance uses Chromium, Firefox and WebKit. These checks do not establish testing on physical phones or every supported OS/browser combination.

`npm run format` applies the repository formatter. The formatter and browser harness are development tools; the distributed application runs without them, accounts or an Internet connection.
