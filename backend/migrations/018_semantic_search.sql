CREATE TABLE public.search_embeddings (
  owner_id TEXT NOT NULL,
  entity_id UUID NOT NULL,
  embedding_model TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position>=0),
  content TEXT NOT NULL,
  embedding DOUBLE PRECISION[] NOT NULL CHECK(cardinality(embedding)>0),
  PRIMARY KEY(owner_id,entity_id,embedding_model,position),
  FOREIGN KEY(entity_id,owner_id) REFERENCES public.entity_nodes(id,owner_id) ON DELETE CASCADE
);
