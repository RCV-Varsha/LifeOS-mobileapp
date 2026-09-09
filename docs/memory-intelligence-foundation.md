# Memory intelligence foundation

V9 makes explicit memories usable only when they are authorized, relevant, current, and trustworthy. It extends V7's version history and V8's feature-specific Context Assembly; it does not add another memory store.

## Validity and trust

Every memory version has an inclusive `valid_from` date and optional inclusive `valid_until` date. Missing `valid_until` means no known expiry, not guaranteed permanent truth. Edits and corrections create a new version and may change the range. Archived, superseded, not-yet-valid, and expired versions are excluded from context.

`source` remains immutable provenance: `USER_EXPLICIT`, `USER_CONFIRMED_AI_SUGGESTION`, or `USER_CORRECTION`. Confidence is server-derived: explicit and explicitly approved values are `CONFIRMED`; corrections are `CORRECTED`. Lifecycle transitions preserve provenance and confidence. Clients and AI cannot assign them.

## Relevance, conflicts, and AI context

The registry maps `planning.daily_buffer_minutes` only to `ADAPTIVE_PLANNING`. Retrieval uses the authenticated user, canonical key, category, active status, and proposal date. It has a stable revision/id ordering and returns either one current version or a controlled zero default. The database permits one current version per stable memory; optimistic revisions reject stale competing writes, and a correction supersedes the prior version atomically.

Context Assembly passes Adaptive Planning only the selected value plus provenance, confidence, revision, and validity. Daily Review receives no memories. History, correction notes, other users' data, archived versions, and unusable date ranges never enter AI context. AI still cannot create or modify memory; an AI suggestion requires the existing explicit approval request.

## Deferred

Embeddings, vector or semantic search, autonomous extraction, inferred confidence, decay scoring, sensitivity classification, memory graphs, broad categories, and memory-heavy UI remain deliberately deferred.
