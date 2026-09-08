# Task execution API

These endpoints support the local LifeOS prototype. They validate input and
database relationships, but they do not authenticate users or enforce
ownership. Do not expose them as a public production API.

## Accept a plan and create tasks

`POST /goals/:goalId/plan/accept`

Accepts the stored, validated plan and materializes one task per plan action in
a PostgreSQL transaction. Repeating the request returns the accepted plan and
the same task count without creating duplicates.

- `200`: `{ goalPlan, taskCount }`
- `400`: malformed goal ID
- `404`: goal has no stored plan
- `500`: acceptance failed and the transaction was rolled back

## List a goal's tasks

`GET /goals/:goalId/tasks`

Returns `{ tasks, progress }` for an accepted plan, ordered by plan day and
action position. A known goal without accepted tasks returns an empty list.

- `200`: persisted tasks and deterministic progress
- `400`: malformed goal ID
- `404`: goal does not exist

## List today's tasks

`GET /tasks/today?timeZone=Asia/Kolkata`

The query requires a valid IANA timezone. Day 1 is the plan's acceptance date
in that timezone; subsequent local calendar dates select Days 2 through 7.
The server's local timezone is not used. See
`docs/decisions/004-task-execution-v1.md` for the prototype assumption.

- `200`: `{ date, timeZone, tasks, progress }`
- `400`: missing or invalid timezone

## Complete a task

`POST /tasks/:taskId/complete`

Sets the task to `completed` and assigns the database server timestamp. The
endpoint accepts no request body. Repeating the request preserves the original
completion timestamp.

- `200`: `{ task }`
- `400`: malformed task ID or unexpected request body
- `404`: task does not exist or its parent plan is not accepted

## Undo completion

`POST /tasks/:taskId/uncomplete`

Returns the task to `pending` and clears `completedAt`; it does not delete the
task. The endpoint accepts no request body and is safe to repeat.

- `200`: `{ task }`
- `400`: malformed task ID or unexpected request body
- `404`: task does not exist or its parent plan is not accepted

## Task response fields

Each task contains `id`, `goalId`, `goalPlanId`, `goalTitle`, `dayNumber`,
`position`, `instruction`, `plannedMinutes`, `status`, `createdAt`, and
`completedAt`. `goalTitle` is read from the accepted plan snapshot; the task
table itself does not duplicate goal identity or title.
