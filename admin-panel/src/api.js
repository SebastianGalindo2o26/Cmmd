const apiBase = import.meta.env.VITE_API_URL || '/api';

export async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const token = localStorage.getItem('pos_auth_token');
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'content-type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(body?.error ?? 'No se pudo completar la solicitud');
    error.status = response.status;
    error.details = body?.detalles;
    throw error;
  }
  return body;
}
