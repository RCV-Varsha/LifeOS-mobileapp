# 007 — Explicit outcome and milestone semantics

## Decision

Represent one primary desired outcome and ordered, equally weighted milestones directly under each goal. Keep tasks executable and optionally link each task to one milestone. Keep outcome and milestone completion explicit.

## Why

Task completion records activity, not real-world success. Separate records let LifeOS state both facts without treating one as evidence for the other. A nullable link preserves every existing plan and task.

Optimistic integer revisions reject stale writes. Composite database constraints and a task-link trigger enforce ownership and same-goal relationships below the route layer. AI creates only schema-validated drafts from minimal goal context.

## Consequences

The Goal Detail and Daily Review surfaces can show activity and achievement separately. Today can explain why a linked task matters. Outcome health and evidence-based automation remain deferred until trustworthy evidence and trajectory data exist.
