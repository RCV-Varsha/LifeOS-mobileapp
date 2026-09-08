export type PreferenceKey = 'planning.max_major_tasks' | 'interaction.explanation_length';
export type PreferenceCategory = 'PLANNING' | 'INTERACTION';
export type PreferenceSource = 'USER_EXPLICIT' | 'USER_CORRECTION';
export type PreferenceStatus = 'ACTIVE' | 'ARCHIVED' | 'SUPERSEDED';
export type PreferenceValue = number | 'concise' | 'standard';

export type Preference = {
  id: string;
  versionId: string;
  key: PreferenceKey;
  category: PreferenceCategory;
  value: PreferenceValue;
  source: PreferenceSource;
  status: PreferenceStatus;
  revision: number;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PreferenceSuggestion = {
  key: PreferenceKey;
  category: PreferenceCategory;
  value: PreferenceValue;
  reason: string;
};
