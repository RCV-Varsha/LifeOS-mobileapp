# AI Daily Review Contract — V1

## Purpose

Interpret one deterministic daily execution snapshot and recommend one useful
next action. The backend calculates facts; Groq only interprets them.

## Backend-owned input and output

The backend supplies `totalTasks`, `completedTasks`, `incompleteTasks`,
`completionRate`, represented goals, and task status/details. These values are
calculated from persisted accepted-plan tasks for the requested local date.
They are returned to mobile from the persisted metrics snapshot and are never
accepted from model output.

## Model output

```json
{
  "summary": "A concise interpretation of the day",
  "observations": ["An evidence-based observation"],
  "strengths": ["A demonstrated strength"],
  "areas_to_improve": ["A practical improvement area"],
  "recommended_next_action": "One concrete next action"
}
```

All object fields are required and unexpected fields are rejected. Summary is
1–600 characters; the next action is 1–300 characters. Each list contains at
most three strings of 1–240 characters. Empty lists are permitted when the data
does not support a claim.

The service prompt marks task and goal text as untrusted, prohibits invented
history, causes, and intent, and requires strict JSON Schema output. The
application validates the parsed response again before persistence. Provider
failures or malformed output produce no review.

## Security and reuse

The Groq credential remains in backend environment configuration. Loading a
review never calls Groq. Generation is an explicit POST and an existing valid
review for the same date/timezone is reused.
