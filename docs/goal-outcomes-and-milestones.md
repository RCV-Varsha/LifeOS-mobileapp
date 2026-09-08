# Goal outcomes and milestones

## Product semantics

- **Goal:** what the user wants to accomplish.
- **Outcome:** the observable state that would make the goal meaningfully successful.
- **Milestone:** a meaningful intermediate achievement on the way to that outcome.
- **Task:** concrete work the user performs.
- **Execution:** the recorded completion or non-completion of work.
- **Review:** deterministic execution metrics plus an optional, schema-validated AI interpretation.
- **Adaptation:** a user-approved change to the executable daily plan when reality changes.

An activity such as “study for 30 minutes” is a task. “Demonstrate the fundamentals in a small program” is a milestone. “Build and deploy a working Python application” is an outcome.

> Task completion measures activity.

> Milestone completion measures intermediate achievement.

> Outcome completion requires explicit or trustworthy evidence.

V1 uses explicit user confirmation for milestone completion and outcome achievement. Completing a linked task never completes either automatically.

## Model and ownership

Each goal may have one `goal_outcomes` row and zero to 100 ordered `goal_milestones` rows. The mobile flow currently limits initial and AI-created milestone drafts to eight. Outcomes may be qualitative or measurable; a measurable target stores a non-negative value and required unit. A target does not constitute evidence.

Every new row repeats the existing `owner_id` boundary. The API derives the V1 owner (`local`) on the backend; it never accepts owner identity from a request. Composite foreign keys keep a milestone with its outcome, goal, and owner. A database trigger rejects a task-to-milestone link unless the task plan and milestone share a goal and owner. SQL is parameterized.

Deleting an outcome cascades only its milestones. Each affected task's nullable `milestone_id` becomes `NULL`; task and plan records remain intact. Deleting a goal retains the existing cascade behavior.

## Progress

Goal responses expose two metrics:

- `activity`: completed accepted-plan tasks / accepted-plan tasks.
- `milestone`: explicitly completed milestones / milestones, or `null` when none exist.

Milestones use equal weighting in V1. `legacyPercent` remains activity percentage when no milestones exist and becomes milestone percentage when milestones exist. The separate metrics remain authoritative; the compatibility field must not be described as outcome completion.

Daily Review snapshots include milestone progress for goals represented by that day's tasks. AI receives those verified metrics and may explain them, but does not calculate or mutate them. Existing persisted reviews without `milestoneProgress` remain readable by the mobile client.

## AI responsibility and failure behavior

`POST /goals/:goalId/outcome-suggestions` sends only the owned goal title and description. Groq must return one outcome and up to eight ordered milestones under a strict JSON schema. Runtime validation rejects extra fields, IDs, oversized text, malformed order, and oversized provider content.

Suggestions are drafts. The endpoint performs no outcome or milestone mutation. The user may edit or ignore a suggestion and must explicitly save it. Missing configuration, timeouts, rate limits, malformed output, and provider failure leave every manual flow available.

## Concurrency

Outcomes and milestones carry positive integer revisions. Updates, status changes, deletes, and reordering require the last observed revision. A stale write returns HTTP 409 instead of overwriting newer state. Repeating a milestone status request with the current revision is idempotent and does not increment revision. Reorder locks the complete owned milestone set in a transaction.

## Architecture

```text
Goal
  ↓
Desired outcome
  ↓
Milestones
  ↓
Tasks (optional milestone link)
  ↓
Execution
  ↓
Review
  ↓
Adaptation
  ↺ back to Tasks
```

## Migration and compatibility

Migration `006_create_goal_outcomes_and_milestones.sql` creates both domain tables, adds nullable `tasks.milestone_id`, indexes linked tasks, and installs the relationship-integrity trigger. It creates no outcome rows for existing goals. Existing goals therefore remain “outcome undefined,” existing tasks remain unlinked, and plan generation, acceptance, Today, completion, review, and adaptive planning continue using their existing task-oriented behavior.

## Limitations and deferred work

- Goal health is deferred. Current data does not establish a reliable expected trajectory, so `ON_TRACK`/`AT_RISK` would fabricate confidence.
- Outcome evidence capture and automatic verification are deferred.
- Plan generation does not invent or persist milestone links. Users can link accepted tasks explicitly after plan acceptance.
- V1 remains a local-owner system; production authentication and multi-user identity are outside this slice.
- No milestone weighting, habit tracking, calendar integration, embeddings, memory, or autonomous action is introduced.
