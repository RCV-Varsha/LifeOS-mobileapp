# Explicit memory foundation

V7 is an explicit-memory foundation, not an autonomous memory system.

## Meaning and scope

A LifeOS memory is a durable, user-controlled fact or constraint that has a supported product behavior. It is distinct from a V6 behavioral preference and from temporary daily context. V7 supports one typed memory:

| Key | Category | Value | Consumer |
|---|---|---|---|
| `planning.daily_buffer_minutes` | `CONSTRAINT` | Integer 0–240 | Adaptive Planning reserves the value before selecting or accepting work. |

“I am tired today” is temporary context and is never automatically stored. V7 does not store arbitrary text, sensitive profiles, inferred personality, conversations, goals, or preferences as memory.

## Sources, lifecycle, and corrections

Sources are `USER_EXPLICIT`, `USER_CONFIRMED_AI_SUGGESTION`, and `USER_CORRECTION`. AI inference is not a source because inference cannot persist.

A stable `user_memories` row owns immutable versions. One current version is `ACTIVE` or `ARCHIVED`; earlier versions are `SUPERSEDED`. Edits, corrections, archive, and restore require the expected revision. Corrections additionally link the exact previous and new versions with a timestamp and optional 1–500 character note.

Archive removes a memory from active use but retains history and supports restore. Correction replaces an inaccurate current value while preserving its lineage. Permanent deletion is intentionally deferred; the separate stable identity and version tables allow a future authenticated deletion pipeline to remove the complete lineage deliberately.

## Consent and AI access

AI cannot silently persist memory.

The suggestion endpoint sends only the user-provided statement and the one supported registry definition to AI. It returns `persisted: false`. The mobile screen shows the proposed value with **Remember** and **Don't remember** controls. Only the separate approval endpoint validates and stores it as `USER_CONFIRMED_AI_SUGGESTION`.

AI services have no memory repository or write capability. Adaptive Planning obtains memory through this server-controlled path:

```text
authenticated current user → owner-scoped ACTIVE CONSTRAINT lookup → resolved buffer → deterministic evaluation → optional AI explanation
```

Retrieval is exact by category and canonical key, never semantic. Archived memories, history, correction notes, other users' records, and the complete memory store are excluded. Daily Review and other AI operations receive no V7 memory.

## Current behavior and limitations

Adaptive Planning subtracts the active buffer from available minutes before ranking tasks. The constraint remains enforced on proposal edits and acceptance and is included in idempotency hashing. Corrections affect future proposals; existing proposal snapshots retain the value used when created.

There are no embeddings, vector database, semantic search, extraction, consolidation, autonomous persistence, behavioral surveillance, sensitive-data classifier, scoped memories, or production authentication in V7.
