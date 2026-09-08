import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpError, parseId, validate } from '../src/http.js';
import { z } from 'zod';

test('parseId acepta enteros positivos', () => {
  assert.equal(parseId('42'), 42);
});

test('parseId rechaza valores inválidos', () => {
  for (const value of ['0', '-1', '1.5', 'texto']) {
    assert.throws(() => parseId(value), HttpError);
  }
});

test('validate devuelve datos válidos y rechaza datos incorrectos', () => {
  const schema = z.object({ nombre: z.string().min(1) });
  assert.deepEqual(validate(schema, { nombre: 'Bebidas' }), { nombre: 'Bebidas' });
  assert.throws(() => validate(schema, { nombre: '' }), HttpError);
});

