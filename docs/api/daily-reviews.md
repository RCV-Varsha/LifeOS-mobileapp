# Daily Review API

These local-prototype endpoints have no authenticated ownership. Do not expose
them publicly until the application adds authentication and authorization.

Both routes require a valid IANA `timeZone` query parameter. `:date` must be a
real, non-future calendar date in `YYYY-MM-DD` form.

## Load a review

`GET /daily-reviews/:date?timeZone=Asia/Calcutta`

Returns current deterministic `metrics` and `review: null` when no review has
been generated. When a review exists, its persisted metric snapshot and
validated AI insight are returned. GET never invokes Groq.

## Generate or reuse a review

`POST /daily-reviews/:date?timeZone=Asia/Calcutta`

The request accepts no body. It returns `201` after validating and persisting a
new insight, or `200` with `reused: true` for an existing review. A date with no
tasks returns `409` and `code: no_tasks` without calling Groq.

Other responses include `400` for request validation, `429` for provider rate
limits, `503` for missing AI configuration, `504` for timeouts, and `502` for
provider or validation failure. Database retrieval failures return `500`.

## Response shape

Metrics contain `totalTasks`, `completedTasks`, `incompleteTasks`,
`completionRate`, represented goals, and the relevant task snapshot. A review
also contains its ID, date, timezone, provider/model metadata, timestamps, and
the validated insight fields documented in `docs/ai-daily-review-contract.md`.
