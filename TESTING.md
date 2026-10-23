# Testing Return Trip Checklist

Automated commands use Node.js 22 or newer; build also uses Python 3.

```sh
npm test
npm run check
npm run build
```

The Node suite tests valid example backups, date rollover, required fields, schema/type limits, malformed/oversized imports, attachment policy, search/status, stale writes, failed writes, corrupt storage preservation and explicit recovery. It uses a synthetic storage adapter; it does not prove browser storage support or printed layout.

## Browser acceptance

Run source with `python -m http.server 8000` and open `http://localhost:8000/`. Also extract the generated ZIP and open its `index.html` directly while offline. Use disposable browser profiles and fictional data.

1. Load examples. Search a supplied detail and switch active/completed filters. Edit a record, attach a small real PNG or JPEG, save, reload and check all data. Try keyboard-only navigation at 390 px and desktop widths.
2. Export a backup. Change the record. Import the backup, cancel and verify no change. Reopen import, confirm replacement and verify restored details and attachments. Undo and confirm the previous saved state returns.
3. Upload SVG, a renamed text file, an oversized image and malformed/wrong-product JSON. Verify clear errors and no changes. Delete a record, cancel once, confirm once, then undo.
4. Modify `return-trip-checklist:v1` in a second tab, then try to save from the stale first tab. Verify refusal and preservation. Reload before continuing.
5. Seed the storage key with malformed JSON. Reload, download original bytes and verify equality. Normal save is blocked. Cancel recovery import once, then confirm a valid backup and verify it persists after reload.
6. Simulate localStorage quota failure. A save must report failure, retain saved records and keep form edits available. Disable the simulation before retrying.
7. Print the current filtered sheet and inspect saved PDF at narrow/desktop viewport. Check long notes, photos and multiple records. Download a PDF receipt separately and confirm the sheet names it without embedding or executing it.

Required release evidence includes browser/version, source versus exact ZIP, viewport, actions, print inspection, independent findings and fixes, remote commit/tag/CI, downloaded artifact digest and Forge readback. These are separate gates; passing unit tests alone is insufficient.
