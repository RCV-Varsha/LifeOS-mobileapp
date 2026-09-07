import { API_URL } from '../config/api';
export async function checkBackendHealth(): Promise<void> {
  const controller = new AbortController();
  const HEALTH_URL = `${API_URL}/health`;
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(HEALTH_URL, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data: unknown = await response.json();

    if (
      typeof data !== 'object' ||
      data === null ||
      !('status' in data) ||
      data.status !== 'ok'
    ) {
      throw new Error('Unexpected health response');
    }
  } finally {
    clearTimeout(timeout);
  }
}