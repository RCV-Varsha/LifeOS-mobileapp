# LifeOS

LifeOS is an AI-powered mobile application for helping users
organize their goals, tasks, habits, and plans.

## Implemented vertical slices

- Goal → validated AI plan → accepted persistent tasks → daily execution.
- Daily execution data → deterministic metrics → validated, persisted AI insight.
- Changed daily context → deterministic feasibility → user-approved adaptive plan → execution.
- Goal → explicit desired outcome → milestones → optionally linked tasks, with activity and achievement progress kept distinct.
- Development identity → current-user authorization → isolated owned domain data.
- Explicit preferences → corrections → scoped planning and explanation behavior.
- Explicit memory → consent and corrections → deterministic planning constraint.
- Feature request → authorized context assembly → bounded AI explanation or insight.

## Workspace

- app/ — Mobile application.
- backend/ — API, application logic, database access, and AI integration.
- ai/ — Reserved for AI design materials.
- docs/ — Project documentation and architectural decisions.

## Security boundary

Database credentials and AI API keys belong on the backend,
never in the mobile application.

See `docs/ai-daily-review-contract.md`, `docs/api/daily-reviews.md`, and
`docs/decisions/005-daily-review-v1.md` for the Daily Review slice.

See `docs/api/adaptive-planning.md` and
`docs/decisions/006-adaptive-daily-planning.md` for Adaptive Daily Planning.

See `docs/goal-outcomes-and-milestones.md`, `docs/api/outcomes.md`, and
`docs/decisions/007-goal-outcomes-and-milestones.md` for outcome semantics.

See `docs/identity-and-ownership.md` for the development-only identity model,
ownership constraints, migration behavior, and production-auth replacement boundary.

See `docs/user-preferences-and-corrections.md`, `docs/api/preferences.md`, and
`docs/decisions/008-controlled-user-preferences.md` for controlled personalization semantics.

See `docs/explicit-memory-foundation.md`, `docs/api/memories.md`, and
`docs/decisions/009-explicit-memory-foundation.md` for the V7 memory trust boundary.

See `docs/context-intelligence.md` and
`docs/decisions/010-feature-specific-context-assembly.md` for V8 context policies.

See `docs/memory-intelligence-foundation.md` and
`docs/decisions/011-deterministic-memory-selection.md` for date-valid, relevance-scoped V9 memory selection.
