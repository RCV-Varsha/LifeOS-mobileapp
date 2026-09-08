# Daily Review V1

## Architecture

```text
Mobile DailyReviewScreen
  | GET (load) / POST (explicit generate)
  v
Daily Review route
  |-- accepted plans + persisted tasks --> deterministic metrics
  |-- metrics only --> Groq --> strict schema + runtime validation
  `-- validated snapshot --> daily_reviews --> mobile
```

Daily reviews reuse the same accepted-plan date calculation as Today's tasks:
the plan acceptance date in the requested IANA timezone is Day 1. No parallel
task or progress model is introduced.

## Persistence

`daily_reviews` stores a deterministic metrics JSON snapshot beside the
validated insight, provider/model provenance, date/timezone key, and timestamps.
`UNIQUE (review_date, time_zone)` prevents duplicate persisted reviews in this
single-owner prototype. The in-process generation map also coalesces concurrent
requests in one backend process. A future multi-instance deployment should add
a distributed generation lock or idempotency mechanism if eliminating duplicate
provider calls across instances is required.

Reviews are immutable snapshots in V1. Task changes after generation do not
silently rewrite AI feedback; no regeneration endpoint is included.

## Error and trust boundaries

Invalid dates/timezones and unexpected POST bodies are rejected before work.
Zero-task dates do not call AI. SQL values are parameterized. Stored insights
are revalidated on read, errors returned to clients are generic, and provider
credentials never cross the backend boundary.

Without users/authentication, date/timezone is the review ownership key. This is
appropriate only for the existing local prototype.
