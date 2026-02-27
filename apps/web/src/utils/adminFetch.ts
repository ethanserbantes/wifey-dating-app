const API_URL = typeof window !== 'undefined' 
  ? (import.meta.env.VITE_API_URL || 'http://192.168.1.78:3001')
  : 'http://192.168.1.78:3001';

let adminSessionToken: string | null = null;

export function setAdminSessionToken(token: string | null) {
  adminSessionToken = token;
  if (token && typeof window !== 'undefined') {
    localStorage.setItem('admin_token', token);
  } else if (typeof window !== 'undefined') {
    localStorage.removeItem('admin_token');
  }
}

export default async function adminFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = `${API_URL}${endpoint}`;
  
  // Get token from localStorage first, then fall back to in-memory token
  let token = adminSessionToken;
  if (!token && typeof window !== 'undefined') {
    token = localStorage.getItem('admin_token');
  }
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  return response;
}
