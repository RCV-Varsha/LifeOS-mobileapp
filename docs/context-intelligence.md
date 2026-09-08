# Context Intelligence

V8 introduces a small Context Assembly boundary. It is not JARVIS, semantic retrieval, or a general user-context dump.

```text
authenticated feature request
→ owner-scoped feature repository data
→ feature-specific ContextAssembler policy
→ active relevant preference/memory selection
→ runtime-validated structured context
→ authorization metadata removed
→ AI service
```

The client never supplies a user ID. Routes obtain the current user from `request.user`; existing repositories scope daily data, tasks, preferences, and memories to that user. AI services have no repository or database capability.

## Policies

| Source | Adaptive Planning | Daily Review |
|---|---|---|
| User | Internal authenticated-user authorization marker; not sent to AI | Same |
| Situation | Date, time zone, available minutes, priority task ID | Review date and time zone |
| Goals | Goal IDs/titles represented by eligible owned tasks | Goal summaries already present in deterministic metrics |
| Tasks/execution | Eligible task IDs, goal association, instructions, estimates, status, plus deterministic evaluation | Aggregate completion metrics and milestone progress; task instructions are excluded |
| Preferences | Active `PLANNING` maximum-task value and active `INTERACTION` explanation length | Active `INTERACTION` explanation length only |
| Memories | Active exact-key planning buffer constraint | None |

Correction history, notes, archived/superseded personalization, unrelated categories, client ownership fields, and records belonging to another user are never included. When no active value exists, controlled defaults are assembled. Empty task/review contexts are valid.

## Relevance and validation

Selection is deterministic by policy, category, canonical key, feature date, and current owner. There is no semantic search. Context values carry a selection reason for internal auditability. Runtime validators enforce the policy name, authenticated authorization basis, bounded preference/memory values, valid capacity, and the Daily Review no-memory rule.

Adaptive Planning continues to make deterministic selection decisions outside AI. Daily Review metrics remain deterministic and are persisted unchanged. AI only explains or summarizes the allowlisted assembled payload.

## Deliberate exclusions

V8 adds no embeddings, vector database, automatic memory extraction, autonomous agent, calendar integration, proactive notification, personality engine, broad knowledge graph, context API endpoint, or AI database access.
