import { API_URL } from '../config/api';

export type CurrentSession = {
  user: {
    id: string;
    status: 'ACTIVE';
  };
};

export async function getCurrentSession(signal: AbortSignal): Promise<CurrentSession> {
  const response = await fetch(`${API_URL}/me`, { signal });
  if (!response.ok) throw new Error(`Identity request returned HTTP ${response.status}`);
  const value: unknown = await response.json();
  if (
    !value || typeof value !== 'object' || !('user' in value) ||
    !value.user || typeof value.user !== 'object' ||
    !('id' in value.user) || typeof value.user.id !== 'string' ||
    !('status' in value.user) || value.user.status !== 'ACTIVE'
  ) throw new Error('Unexpected identity response');
  return { user: { id: value.user.id, status: 'ACTIVE' } };
}
