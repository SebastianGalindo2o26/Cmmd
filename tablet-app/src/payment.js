export function paymentAmountToCents(value) {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(normalized)) return null;

  const [whole, decimal = ''] = normalized.split('.');
  return Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
}

export function validatePaymentAmount(value, balance) {
  const amountCents = paymentAmountToCents(value);
  const balanceCents = paymentAmountToCents(balance);

  if (amountCents === null) return 'Ingresa un monto válido con máximo dos decimales.';
  if (amountCents <= 0) return 'El monto debe ser mayor que cero.';
  if (balanceCents === null || balanceCents <= 0) return 'La orden no tiene saldo pendiente.';
  if (amountCents > balanceCents) return 'El pago no puede superar el saldo pendiente.';
  return null;
}

export function normalizePaymentAmount(value) {
  const cents = paymentAmountToCents(value);
  if (cents === null) return null;
  return (cents / 100).toFixed(2);
}

export function paymentMethodLabel(method) {
  return method === 'tarjeta' ? 'Tarjeta' : 'Efectivo';
}
