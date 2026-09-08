# ADR 010: Feature-specific context assembly

## Decision

Adaptive Planning and Daily Review will use typed, runtime-validated policies in a dedicated `ContextAssembler`. The assembler receives the authenticated current user and trusted owner-scoped feature results, selects active relevant personalization through owner-scoped repositories, and produces an allowlisted contract. AI adapters strip internal authorization metadata before serialization.

## Rationale

A single global context object would grow into an implicit data dump and make relevance, authorization, prompt exposure, and testing difficult to reason about. Letting AI retrieve data would move security decisions outside deterministic application code. Explicit policies keep each additional source reviewable.

## Consequences

- Adaptive Planning and Daily Review intentionally receive different shapes.
- Daily Review receives no V7 memory, planning preference, or task instruction.
- Context Assembly does not replace deterministic repositories or business logic.
- New features must define and test their own allowlist instead of reusing an “everything” context.
