const apiBase = import.meta.env.VITE_API_URL || '/api';

export async function api(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
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
