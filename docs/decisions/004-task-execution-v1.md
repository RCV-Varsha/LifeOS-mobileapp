# Task execution in V1

## Today and timezones

LifeOS does not yet have user profiles or a persisted user timezone. For the
local prototype, the mobile app sends its current IANA timezone with
`GET /tasks/today?timeZone=...`.

The acceptance date in that timezone is Day 1. Each following local calendar
date advances the plan day by one. The backend validates the timezone and uses
calendar-date arithmetic, so its machine timezone never determines today's
tasks. If the device cannot report a timezone, the mobile app explicitly falls
back to UTC.

Changing the device timezone can change which plan day is considered today.
Persisting a user's preferred timezone belongs with future user accounts.

## Execution history

No separate history table is needed for V1. Each task preserves:

- what was planned (`instruction`, `planned_minutes`, day and position);
- its current state (`pending` or `completed`);
- when it was completed (`completed_at`).

Uncompleting a task intentionally clears `completed_at`. V1 stores current
execution state, not a full audit trail of every toggle. An event-history table
should be introduced only if product requirements later need that audit trail.

Complete and uncomplete operations are idempotent. Retrying completion preserves
the original server timestamp; retrying uncomplete keeps the task pending. This
makes mobile retries safe without creating invalid transitions.

## Progress

Progress is deterministic: completed task count divided by total task count,
rounded to the nearest whole percentage. The backend returns persisted counts;
the mobile screen recalculates after each persisted task update for immediate
display. AI is not involved.

## Security boundary

These endpoints are for local development and sample data. They validate IDs,
request shapes, relationships, and stored state, but there is no authenticated
user ownership yet. They must not be exposed publicly as production APIs until
authentication and authorization are implemented.

The local backend starts Node with `--use-system-ca`. This keeps TLS certificate
verification enabled while allowing Node to use certificates trusted by the
Windows certificate store, which is required on the current development
network. It is not equivalent to disabling TLS verification.
