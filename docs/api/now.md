# NOW API

`GET /now?timeZone=Asia/Calcutta` returns the authenticated user's current deterministic NOW projection. Client ownership fields are forbidden. The response includes state, direction, execution count, capacity provenance, adaptive-plan status, relevant controlled personalization, uncertainty, and at most one recommended action.

The endpoint is read-only, sends no data to AI, and never accepts or rejects an adaptive proposal. Invalid time zones return `400`; assembly failures return `500`.
