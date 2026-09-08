# User preferences and corrections

## Scope

Preference storage is not general-purpose memory.

A preference is an explicit, user-controlled instruction about how LifeOS should behave. A correction explicitly replaces a previously stored preference value. Daily context remains temporary operational input. AI inference is neither a preference nor permission to persist one.

Temporary context must not automatically become persistent preference.

The current system does not accept sensitive profiles, arbitrary keys, free-form memory, psychological traits, or AI-inferred behavior. Preference notes are limited to 500 characters and should not contain sensitive information.

## Supported registry

| Preference | Category | Valid value | Consumer | Behavior |
|---|---|---|---|---|
| `planning.max_major_tasks` | `PLANNING` | Integer 1–10 | Deterministic Adaptive Planning | Caps tasks selected in a newly evaluated proposal after normal priority ranking. Time capacity and explicit task priority remain authoritative. |
| `interaction.explanation_length` | `INTERACTION` | `concise` or `standard` | Adaptive Planning and Daily Review AI prompts | Requests shorter or standard explanation presentation. It never changes task selection or review metrics. |

Categories are deliberately limited to `PLANNING` and `INTERACTION`. Preferences are global to the user; goal/task/day inheritance is not implemented.

## Lifecycle, versions, and corrections

`user_preferences` gives a preference a stable identity and enforces one key per user. `user_preference_versions` stores typed integer or enum values. One current version is either `ACTIVE` or `ARCHIVED`; older versions are `SUPERSEDED`.

Create, edit, correction, archive, and reactivation all produce a new version. Corrections additionally create `user_preference_corrections` rows linking the previous and new version. History therefore shows the old value, new value, source, revision, time, lifecycle state, and optional correction note.

Every edit, correction, archive, and reactivation requires `expectedRevision`. The repository locks the stable preference row before replacement. If another request has already advanced the revision, the stale request receives `409` and cannot overwrite it. The unique `(user_id, key)` constraint prevents duplicate or contradictory lineages for the same canonical key.

## Ownership and privacy

All routes use the authenticated development user from `request.user`; clients cannot submit `ownerId` or `userId`. Repository reads, writes, corrections, and history queries include the user ID. Database composite foreign keys prevent cross-user version and correction relationships. Foreign preference IDs are returned as not found.

Preference values and user statements are not logged. Preferences are not sent to analytics or unrelated AI calls.

## AI boundary

AI may suggest a preference, but AI cannot persist a preference without explicit user approval.

`POST /preference-suggestions` sends only the explicit statement and supported registry metadata to AI. Its output is schema-validated and returned with `persisted: false`. The mobile UI offers **Remember** and **Don't remember**. Only the separate approval request validates the value again and stores it. Discarding a suggestion writes nothing.

There is no automatic extraction from daily context, goals, tasks, reviews, or conversations. A statement such as “I'm tired today” remains temporary unless the user deliberately opens the suggestion flow and approves a supported preference.

## Context selection

Adaptive Planning requests only `PLANNING` and `INTERACTION` active preferences. Daily Review requests only `INTERACTION`. Archived values and complete history are excluded. AI receives only the relevant resolved presentation value; it never accesses the database or receives correction history.

Deterministic review metrics never depend on preferences. Existing stored reviews and already-created adaptive proposals remain immutable snapshots; corrected preferences affect subsequent generations/evaluations.

## Mobile control

The Preferences screen answers “What does LifeOS currently believe I prefer?” It supports creation, normal edits, explicit correction with an optional note, archive, reactivation, history, AI suggestion approval, and suggestion discard. No preference is hidden.

## Deferred memory work

This slice adds no memories table, embeddings, vector search, automatic extraction, consolidation, ranking, sensitive classification, personality model, or autonomous persistence. A future memory system must build on identity, explicit ownership, source/confidence semantics, user visibility, correction, deletion propagation, and context-selection policy.
