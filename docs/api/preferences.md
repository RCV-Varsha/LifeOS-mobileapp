# Preferences API

All endpoints require the centrally resolved development user. Client ownership fields are forbidden.

- `GET /preferences` lists each current active or archived preference.
- `POST /preferences` creates `{ key, category, value }` with source `USER_EXPLICIT`.
- `PUT /preferences/:id` creates a new active version from `{ value, expectedRevision }`.
- `DELETE /preferences/:id` archives through `{ expectedRevision }` without deleting history.
- `POST /preferences/:id/reactivate` restores an archived preference using `{ expectedRevision }`.
- `POST /preferences/:id/correct` explicitly corrects `{ value, expectedRevision, note? }` and records the old/new relationship.
- `GET /preferences/:id/history` returns ordered versions and correction events.
- `POST /preference-suggestions` accepts `{ statement }` and returns `{ suggestion, persisted: false }`.
- `POST /preference-suggestions/accept` accepts `{ suggestion: { key, category, value } }` and persists only after that explicit request.

Invalid keys/categories/typed values return `400`; duplicate keys and stale revisions return `409`; missing or foreign IDs return `404`. AI unavailability returns `503` before a provider call or `502` for an unusable provider response.
