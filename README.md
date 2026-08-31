# LifeOS

LifeOS is an AI-powered mobile application for helping users
organize their goals, tasks, habits, and plans.

## Initial focus

Build one end-to-end journey: collect basic user context,
store it, generate an AI-assisted plan, validate the result,
and display it in the mobile app.

## Workspace

- app/ — Mobile application.
- backend/ — API, application logic, database access, and AI integration.
- ai/ — Reserved for AI design materials.
- docs/ — Project documentation and architectural decisions.

## Security boundary

Database credentials and AI API keys belong on the backend,
never in the mobile application.