# LifeOS

LifeOS is an AI-powered mobile application for helping users
organize their goals, tasks, habits, and plans.

## Implemented vertical slices

- Goal → validated AI plan → accepted persistent tasks → daily execution.
- Daily execution data → deterministic metrics → validated, persisted AI insight.
- Changed daily context → deterministic feasibility → user-approved adaptive plan → execution.

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
