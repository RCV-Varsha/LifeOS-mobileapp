# Adaptive Planning API

All endpoints are local-prototype operations for the server-controlled `local`
owner. Dates must be real, non-future `YYYY-MM-DD` values and `timeZone` must be a
valid IANA timezone.

- `GET /daily-contexts/:date?timeZone=...` loads context or returns `context: null`.
- `PUT /daily-contexts/:date?timeZone=...` saves `availableMinutes` (0–1440), an
  optional owned `priorityTaskId`, optional `blocker` (500 chars), and optional
  `note` (1000 chars).
- `POST /daily-plans/:date/proposals?timeZone=...` requires `Idempotency-Key` and
  accepts optional `{ "includeExplanation": boolean }`. It returns `kind:
  "no_change"` when the current plan fits, or a persisted proposal. AI failure is
  reported as `aiFallback: true`, not an endpoint failure.
- `GET /plan-proposals/:id` retrieves an owned proposal.
- `PUT /plan-proposals/:id` replaces the draft selection with
  `{ "selected": [{ "taskId": "...", "allocationMinutes": 30 }] }`.
- `POST /plan-proposals/:id/reject` rejects without changing Today.
- `POST /plan-proposals/:id/accept` requires `Idempotency-Key`, accepts no body,
  and transactionally applies the overlay. Stale state returns `409`.
- `POST /plan-changes/:id/undo` conditionally restores the prior overlay only when
  no later daily-plan change exists.

Unexpected fields, invalid IDs, unowned task references, over-capacity edits, and
idempotency-key/body mismatches are rejected. SQL values are parameterized.

## Evaluation scenarios

| Scenario | Result |
|---|---|
| 70 required / 90 available | `no_change`; nothing is persisted |
| 85 required / 30 available | greedy ordered feasible subset plus omissions/conflict |
| pinned task exceeds capacity | explicit `priority_does_not_fit` conflict |
| unknown duration | explicit uncertainty; unknown is not allocated as zero |
| user replaces A with B | validated edited selection is authoritative on acceptance |
| task/context/plan changed | `409 stale`; no state overwritten |
| Groq unavailable/malformed | deterministic proposal persists without explanation |
