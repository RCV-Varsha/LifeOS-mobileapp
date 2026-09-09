export type MemoryKey = 'planning.daily_buffer_minutes';
export type MemoryCategory = 'CONSTRAINT';
export type MemorySource = 'USER_EXPLICIT' | 'USER_CONFIRMED_AI_SUGGESTION' | 'USER_CORRECTION';
export type MemoryStatus = 'ACTIVE' | 'ARCHIVED' | 'SUPERSEDED';
export type MemoryConfidence = 'CONFIRMED' | 'CORRECTED';
export type MemoryValidityInput = { validFrom?: string; validUntil?: string | null };

export type Memory = {
  id: string;
  versionId: string;
  key: MemoryKey;
  category: MemoryCategory;
  value: number;
  source: MemorySource;
  confidence: MemoryConfidence;
  status: MemoryStatus;
  revision: number;
  note: string | null;
  validFrom: string;
  validUntil: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MemorySuggestion = {
  key: MemoryKey;
  category: MemoryCategory;
  value: number;
  reason: string;
};
