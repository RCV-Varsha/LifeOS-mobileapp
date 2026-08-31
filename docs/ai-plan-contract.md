# AI Plan Contract — V1

## Purpose

Generate a proposed seven-day plan for one saved goal.
The user reviews the proposal before accepting it.

## Model input

- Goal title
- Optional motivation
- Available minutes per day

Goal text is untrusted data, not an instruction that can override
the application's planning rules.

Only necessary goal context is sent to the AI provider.
The user must be informed before generation.

## Model output

{
  "summary": "A short explanation of the proposed week",
  "days": [
    {
      "day": 1,
      "title": "A short day title",
      "actions": [
        {
          "instruction": "A concrete action",
          "minutes": 20
        }
      ]
    }
  ]
}

The example shows one day for brevity.
A valid response must contain all seven days.

## Validation rules

- Reject unexpected fields at every object level.
- Summary: 1–600 characters after trimming.
- Exactly seven days, numbered 1–7 in order.
- Day title: 1–120 characters after trimming.
- Each day contains 1–3 actions.
- Action instruction: 1–500 characters after trimming.
- Action minutes: a positive integer.
- Daily action minutes must total no more than the goal's
  available minutes per day.

Structural validity does not establish factual accuracy,
safety, or suitability.

## Application-owned fields

The backend, not the model, assigns:
- Plan ID
- Associated goal ID
- Creation timestamp
- Status: proposed or accepted
- Acceptance timestamp, when applicable

Record the goal context used for generation so the proposal
remains understandable if the goal later changes.

## User flow

1. Select a saved goal.
2. Request a seven-day plan.
3. Wait for generation and validation.
4. Review the stored proposal.
5. Accept it or leave it proposed.

Acceptance does not create tasks, calendar events, or external actions.

## Failure behavior

- Provider errors, refusals, incomplete responses, or validation
  failures produce no usable plan.
- Keep the original goal intact.
- Show a clear failure message.
- Do not automatically retry paid model requests.
- Viewing a stored plan does not call the model again.
- Do not report success until the proposal is stored.

## Initial scope and security

- Ordinary learning and habit goals using sample data.
- High-stakes planning is outside the initial scope.
- Provider credentials exist only on the backend.
- Avoid logging personal prompts and full model responses.
- No agents, tool calling, or automatic task execution.
- Keep generation local during prototyping.
- Before shared deployment, require authentication, ownership
  checks, and generation limits.