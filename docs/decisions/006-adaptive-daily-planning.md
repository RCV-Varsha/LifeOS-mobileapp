# Adaptive Daily Planning V1

## Architecture

```text
Accepted plans + incomplete tasks + execution state
                         |
Daily context ----------+----> deterministic planner
                                  | feasible evidence
                                  +----> optional Groq explanation
                                  |          (validated, fallible)
                                  v
                            persisted proposal
                                  |
                         user edit/reject/accept
                                  |
                   version checks + DB transaction
                                  |
                      versioned daily-plan overlay
                         /                 \
                    Today              Daily Review
```

The trust boundary is deliberate:

> AI explains/suggests.

> Deterministic backend logic evaluates feasibility.

> Database persists state.

> User decides.

## Daily identity and ownership

Daily records use `(owner_id, local_date, time_zone)`. `local_date` is a calendar
date, timezone is validated as an IANA identifier, and lifecycle timestamps are
UTC-capable `TIMESTAMPTZ` values. A timezone change creates a different daily
identity and never rewrites history. The current local prototype assigns the
server-controlled owner `local`; clients cannot submit an owner ID. This is an
explicit boundary, not production authentication.

## Duration and planning

The existing `tasks.planned_minutes` is the estimate captured from the accepted
weekly plan. Adaptive `daily_plan_items.allocated_minutes` is a separate user-
approved allocation. `tasks.actual_minutes` is nullable and is not inferred from
completion. Unknown duration remains `null` in the planner domain and is omitted
with explicit uncertainty; it is never treated as zero.

The planner considers eligible incomplete tasks for the original local plan day,
plus tasks already present in that day's overlay. Ranking is intentionally small:

1. explicit daily priority task;
2. goal priority, when stored;
3. existing accepted-plan and task ordering;
4. fit within remaining whole-minute capacity.

The current task model has no deadline field, so deadline urgency is not invented.
Adding deadlines requires a separate product decision and migration. When all
durations are known and total required time fits, no proposal is persisted.

## Proposal lifecycle and editing

Persisted states are `ready`, `accepted`, `rejected`, and `stale`. A proposal is
only evidence and a suggested ordered selection. It does not modify Today. User
edits can remove or add an eligible task and change a positive allocation, but
the total must remain within the saved capacity. Editing clears the AI explanation
because it may no longer describe the user's choices.

Creation captures context revision, every affected task revision, each source plan
version, and the base daily-plan version. Acceptance locks and rechecks all of
them. Changed context, task state, source plan, or daily plan causes a `409 stale`
without overwriting newer data.

## Idempotency, transaction, and undo

Proposal creation requires an `Idempotency-Key`; `(owner_id, key)` is unique and
stores a SHA-256 request hash. Reuse with the same logical body returns the same
proposal; reuse with a different body returns `409`. Identical context PUTs do not
advance the context revision. Acceptance records its decision key/hash and returns
the existing accepted result when retried.

Acceptance performs no network calls. In one transaction it locks the proposal,
context, tasks, source plans, and daily plan; verifies revisions and capacity;
replaces daily-plan items; increments the daily-plan version; records before/after
items; and marks the proposal accepted.

Undo restores only the overlay items saved before that accepted change. It never
changes task completion. Undo succeeds only while the daily plan is still at the
change's resulting version; otherwise it returns `409 undo_conflict`. Repeated
undo is safe.

## AI and failure behavior

Groq receives the deterministic evaluation and a minimal task snapshot. Its strict
schema contains summary, reason, authorized task evidence IDs, and an optional
question. Runtime validation rejects missing/extra fields and unknown evidence.
AI errors, timeouts, missing configuration, or malformed output produce the same
usable deterministic proposal with `explanation: null` and `aiFallback: true`.
Prompts/responses and user notes are not logged.

## Review and progress semantics

Today reads an accepted daily overlay when one exists, including an intentionally
empty plan; otherwise it uses the original seven-day schedule. Daily Review uses
the same overlay task set and allocations for that date. Completion is still the
only achievement signal, and adaptive allocation never increases progress.

## Deliberate limits

- local single-owner prototype; no authentication;
- goal priority exists as a backend-ready field but has no editing UI yet;
- source plan actions always have known estimates today, though the planner safely
  represents future unknown estimates;
- no deadline model, natural-language agent, notification, calendar, or long-term
  preference inference;
- no proposal expiry job or cross-process AI-call coalescing;
- observability is limited to non-sensitive error categories; durable metrics are
  deferred until an operational telemetry system exists.
