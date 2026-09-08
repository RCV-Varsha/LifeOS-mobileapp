export type MemoryKey = 'planning.daily_buffer_minutes';
export type MemoryCategory = 'CONSTRAINT';
export type MemorySource = 'USER_EXPLICIT' | 'USER_CONFIRMED_AI_SUGGESTION' | 'USER_CORRECTION';
export type MemoryStatus = 'ACTIVE' | 'ARCHIVED' | 'SUPERSEDED';

export type Memory = {
  id: string;
  versionId: string;
  key: MemoryKey;
  category: MemoryCategory;
  value: number;
  source: MemorySource;
  status: MemoryStatus;
  revision: number;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MemorySuggestion = {
  key: MemoryKey;
  category: MemoryCategory;
  value: number;
  reason: string;
};
