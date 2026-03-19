import { createClient } from '@/lib/supabase/client';

class ApiClient {
  private async getAuthHeaders(): Promise<Record<string, string>> {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  }

  async get<T>(endpoint: string): Promise<T> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(endpoint, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || err.message || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async post<T>(endpoint: string, body?: Record<string, unknown>): Promise<T> {
    const headers = await this.getAuthHeaders();
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || err.message || `HTTP ${res.status}`);
    }
    return res.json();
  }
}

export const api = new ApiClient();
