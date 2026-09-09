# ADR 011: Deterministic memory selection

## Decision

Store validity and server-derived confidence on each explicit-memory version. Select memory for AI features by authenticated owner, registry-declared feature relevance, canonical key/category, active lifecycle state, and the feature's date. Preserve optimistic version conflicts and correction lineage.

## Consequences

Context is explainable, reproducible, and bounded without embeddings. A missing or unusable memory becomes a controlled default. This foundation supports only the existing planning constraint; semantic relevance, inferred memories, decay, and additional categories require later explicit decisions.
