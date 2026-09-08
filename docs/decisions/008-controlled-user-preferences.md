# ADR 008: Controlled preferences before general memory

## Decision

LifeOS will build personalization in this order:

```text
Identity → explicit preferences → explicit corrections → future memory
```

It will not implement “store everything.”

## Rationale

Broad automatic memory mixes facts, temporary context, uncertain inference, sensitive information, and durable user instructions. That makes ownership, correction, deletion, relevance, and trust difficult to reason about. It can preserve statements the user never intended to store and allow outdated or unrelated data to influence AI behavior invisibly.

A small registry makes every stored value understandable and validates it according to a real consumer. Immutable versions and explicit correction links make changes auditable. Category-scoped context selection limits what reaches each AI call. Separate suggestion and approval operations ensure AI cannot authorize its own persistence.

## Consequences

- Only two currently consumed keys exist.
- User visibility and correction take priority over breadth.
- Temporary context is never promoted automatically.
- AI suggestions are ephemeral until explicit approval.
- Corrections affect future evaluations and generations, not immutable stored artifacts.
- General memory, confidence scoring for inference, scoped preference inheritance, and sensitive-data classification remain deferred.
