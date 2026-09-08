# Memories API

All endpoints use the centrally authenticated current user. Client `ownerId` and `userId` fields are forbidden.

- `GET /memories` lists current active or archived memories.
- `POST /memories` creates `{ key, category, value }`.
- `PUT /memories/:id` edits `{ value, expectedRevision }`.
- `DELETE /memories/:id` archives `{ expectedRevision }` without erasing history.
- `POST /memories/:id/reactivate` restores `{ expectedRevision }`.
- `POST /memories/:id/correct` corrects `{ value, expectedRevision, note? }`.
- `GET /memories/:id/history` returns versions and explicit correction links.
- `POST /memory-suggestions` accepts `{ statement }` and returns `{ suggestion, persisted: false }`.
- `POST /memory-suggestions/accept` stores a validated `{ suggestion: { key, category, value } }` after explicit approval.

Invalid input returns `400`; foreign/missing IDs return `404`; duplicate keys and stale revisions return `409`. Provider configuration/unavailability returns `503`/`502` and writes nothing.
