import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

function readPort() {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT debe ser un entero entre 1 y 65535');
  }
  return port;
}

function readTimezone() {
  const timezone = process.env.RESTAURANT_TIMEZONE ?? 'America/Guatemala';
  try {
    new Intl.DateTimeFormat('es-GT', { timeZone: timezone }).format();
  } catch {
    throw new Error(`RESTAURANT_TIMEZONE no es válida: ${timezone}`);
  }
  return timezone;
}

export const config = Object.freeze({
  databaseUrl: required('DATABASE_URL'),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: readPort(),
  restaurantTimezone: readTimezone(),
});
