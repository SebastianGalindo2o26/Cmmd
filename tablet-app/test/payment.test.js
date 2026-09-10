import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizePaymentAmount,
  paymentAmountToCents,
  paymentMethodLabel,
  validatePaymentAmount,
} from '../src/payment.js';

test('convierte importes a centavos sin usar punto flotante', () => {
  assert.equal(paymentAmountToCents('10'), 1000);
  assert.equal(paymentAmountToCents('10.5'), 1050);
  assert.equal(paymentAmountToCents('10,05'), 1005);
  assert.equal(normalizePaymentAmount('10,5'), '10.50');
});

test('rechaza formatos, ceros y sobrepagos', () => {
  assert.match(validatePaymentAmount('', '20.00'), /válido/);
  assert.match(validatePaymentAmount('1.999', '20.00'), /válido/);
  assert.match(validatePaymentAmount('0', '20.00'), /mayor que cero/);
  assert.match(validatePaymentAmount('20.01', '20.00'), /superar/);
  assert.equal(validatePaymentAmount('20.00', '20.00'), null);
});

test('presenta los métodos de pago soportados', () => {
  assert.equal(paymentMethodLabel('efectivo'), 'Efectivo');
  assert.equal(paymentMethodLabel('tarjeta'), 'Tarjeta');
});
