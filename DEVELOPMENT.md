# Development and acceptance

Return Trip Checklist 1.0.0 has one bounded job: Keep the receipt, deadline and drop-off details with a practical packing checklist. Tick off what is ready before you leave.

The implementation uses dependency-free browser modules. The release builder inlines scripts and styles so the extracted entry point can run offline. Local storage is isolated under `return-trip-checklist:v1`; portable backup format is `return-trip-checklist`, schema version 1. Every mutation validates the complete candidate, compares the latest storage bytes with the loaded baseline, and updates in-memory state only after a successful browser write. Import is whole-notebook replacement with a preview and explicit confirmation. Corrupt storage is never silently reset.

Records are limited to 300; complete serialised backups to 4.5 MB. Attachment count is 3 per record. Text, dates, integers, enums, IDs, duplicate identities, file MIME and base64 signatures are checked. Attachment names are rendered with textContent and are never interpreted as markup. No runtime fetches or remote SDKs are present.

## Scope acceptance

- Verify creation, editing, state changes and deletion/undo with real form interactions.
- Verify every approved field, attachment handling, searching and filtered print output.
- Verify normal reload persistence, validated backup round trip and explicit replacement preview.
- Verify unreadable storage raw export, no write before recovery confirmation, stale-tab refusal and quota failure preservation.
- Verify keyboard operation, visible focus, errors, accessible labels, 390 px layout and desktop print preview.
- Exercise the exact extracted release ZIP offline as well as source over HTTP. Inspect printed PDF, page breaks and labels.
- Independent review and complete remote release checks precede a Gold claim; no such claim is made by this source tree.

Deadlines and return requirements come from you. The app does not interpret store policies, read your inbox, contact retailers or arrange a return. Keep the original receipt; an attachment here is only a copy.

No shared Forge catalog or portfolio owner records are written by these project scripts. Repo/release setup, tag verification, checksums, Pages and Forge publication belong to the coordinating release task.
