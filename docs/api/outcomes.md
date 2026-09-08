# Outcomes and milestones API

All routes operate on the backend-derived V1 owner `local`. UUID resources belonging to another owner are reported as not found.

## Outcome

- `GET /goals/:goalId/outcome` — returns `{ outcome }`; `outcome` may be `null` for an existing legacy goal.
- `POST /goals/:goalId/outcome` — creates the goal's one outcome.
- `PUT /goals/:goalId/outcome` — updates fields and requires `expectedRevision`.
- `DELETE /goals/:goalId/outcome` — requires `{ "expectedRevision": 1 }` and preserves tasks.
- `POST /goals/:goalId/outcome/status` — accepts `in_progress` or `achieved` plus `expectedRevision`.

Create/update fields are `title`, `description`, `targetValue`, `targetUnit`, and `targetDate`. Value and unit must both be null or both be present.

## Milestones

- `GET /goals/:goalId/milestones`
- `POST /goals/:goalId/milestones`
- `PUT /milestones/:id` with `expectedRevision`
- `DELETE /milestones/:id` with `expectedRevision`
- `POST /milestones/:id/status` with `status` and `expectedRevision`
- `PUT /goals/:goalId/milestones/order` with the complete ordered `ids` list and an ID-to-revision map

Statuses are `not_started`, `in_progress`, and `completed`. Completion and reopening are explicit user operations.

## Task link and progress

- `PUT /tasks/:taskId/milestone` with `{ "milestoneId": UUID | null }` links or unlinks a task.
- `GET /goals/:goalId/tasks` now includes `milestoneId`, `milestoneTitle`, `outcomeTitle`, and `{ activity, milestone, legacyPercent }` progress.
- `GET /tasks/today` includes optional milestone/outcome context without changing task selection.

Cross-goal and cross-owner links return 409 and are also rejected by the database.

## AI draft

- `POST /goals/:goalId/outcome-suggestions` with an empty object returns a validated draft.

The response is never persisted. Provider failures return 429, 502, or 503 with a manual-entry-safe message.
