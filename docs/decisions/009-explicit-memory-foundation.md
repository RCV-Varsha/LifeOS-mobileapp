# ADR 009: Explicit typed memory before autonomous memory

## Decision

LifeOS will introduce memory as an owner-scoped registry of typed, explicitly stored values with visible lifecycle, history, correction, and consent. V6 preferences remain separate. V7 initially supports only a daily planning buffer constraint and exact deterministic retrieval.

## Rationale

An unrestricted memory text or JSON store would mix temporary context, inference, sensitive content, and durable facts before LifeOS can safely govern relevance or deletion. Embeddings would improve fuzzy retrieval but would not solve consent, ownership, correction, or trust. One consumed typed key proves those foundations without pretending the product understands arbitrary memories.

## Consequences

- Memory breadth is intentionally tiny.
- AI may suggest but never authorize persistence.
- Only ACTIVE owner-scoped records can affect planning or its explanation.
- Archive is reversible; permanent lineage deletion remains future work.
- Future keys require a validator, category, consent semantics, and a named consumer before registration.
