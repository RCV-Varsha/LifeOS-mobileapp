# Plan-to-task model

## Decision

An accepted AI plan is materialized into one persistent task for each validated
plan action. A task stores its plan, day, position, instruction, planned time,
execution status, and lifecycle timestamps.

Tasks reference `goal_plans` rather than storing a second `goal_id`. The goal is
available through `goal_plans.goal_id`, keeping one authoritative relationship
and preventing a task from naming a different goal than its plan.

`UNIQUE (goal_plan_id, day_number, position)` gives every plan action a stable
materialization key. Repeated acceptance can safely attempt the same inserts
without creating duplicate tasks.

## Acceptance transaction

Plan acceptance locks the plan row, validates the stored JSON, marks the plan
accepted, inserts all tasks, verifies the final task count, and commits. Any
failure rolls back the status change and task inserts together.

## V1 limits

Task status is intentionally limited to `pending` and `completed`. Scheduling,
notifications, recurrence, subtasks, and AI execution are outside this phase.
