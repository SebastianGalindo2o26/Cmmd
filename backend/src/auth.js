import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { config } from './config.js';
import { HttpError } from './http.js';

const scrypt = promisify(scryptCallback);
const HASH_PREFIX = 'scrypt';
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1 };

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function decode(value) {
  return Buffer.from(value, 'base64url');
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64, SCRYPT_OPTIONS);
  return `${HASH_PREFIX}$${SCRYPT_OPTIONS.N}$${SCRYPT_OPTIONS.r}$${SCRYPT_OPTIONS.p}$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}

export async function verifyPassword(password, storedHash) {
  const [prefix, n, r, p, saltValue, hashValue] = String(storedHash ?? '').split('$');
  if (prefix !== HASH_PREFIX || !n || !r || !p || !saltValue || !hashValue) return false;
  try {
    const derived = await scrypt(password, decode(saltValue), 64, {
      N: Number(n), r: Number(r), p: Number(p),
    });
    const expected = decode(hashValue);
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

export function createToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    usuario: user.usuario,
    nombre: user.nombre,
    rol: user.rol,
    iat: now,
    exp: now + 8 * 60 * 60,
  };
  const encodedPayload = encode(JSON.stringify(payload));
  const signature = createHmac('sha256', config.authSecret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function verifyToken(token) {
  const [encodedPayload, signature] = String(token ?? '').split('.');
  if (!encodedPayload || !signature) return null;
  const expected = createHmac('sha256', config.authSecret).update(encodedPayload).digest();
  const received = decode(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const payload = JSON.parse(decode(encodedPayload).toString('utf8'));
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function bearerToken(req) {
  const header = req.get('Authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

export function requireAuth(req, res, next) {
  const user = verifyToken(bearerToken(req));
  if (!user) return next(new HttpError(401, 'Se requiere una sesión válida'));
  req.user = user;
  next();
}

export function requireAuthIfEnabled(req, res, next) {
  if (!config.authRequired) return next();
  return requireAuth(req, res, next);
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      return next(new HttpError(403, 'Tu rol no permite esta operación'));
    }
    next();
  };
}

export function requireRoleIfEnabled(...roles) {
  return (req, res, next) => {
    if (!config.authRequired) return next();
    return requireRole(...roles)(req, res, next);
  };
}
