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
- Current authorized state → deterministic NOW recommendation → existing user-controlled action.

## Workspace

The connected workspace expansion adds authenticated sessions, projects, knowledge,
source-backed assistant/action review, calendar planning, offline task synchronization,
and an Expo web target. See `docs/master-build-implementation-report.md` for the exact
implemented scope, verification results, and remaining master-specification gaps.
Run and deployment instructions are in `docs/deployment.md`.

- app/ — Mobile application.
- backend/ — API, application logic, database access, and AI integration.
- ai/ — Reserved for AI design materials.
- docs/ — Essential setup, implementation, and UI documentation.

## Security boundary

Database credentials and AI API keys belong on the backend,
never in the mobile application.

## Essential documentation

- [Run and deploy](docs/deployment.md)
- [Android USB development and Windows build troubleshooting](docs/android-usb-development.md)
- [Implementation scope and known gaps (September 2026 snapshot)](docs/master-build-implementation-report.md)
- [UI design language](docs/ui-design-language.md)
- [Splash and onboarding behavior](docs/splash-onboarding.md)
