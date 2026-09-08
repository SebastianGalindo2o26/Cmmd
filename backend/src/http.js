export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function parseId(value, label = 'id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, `${label} debe ser un entero positivo`);
  }
  return id;
}

export function validate(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, 'Datos inválidos', result.error.flatten());
  }
  return result.data;
}

export function notFound(entity) {
  return new HttpError(404, `${entity} no encontrado`);
}

