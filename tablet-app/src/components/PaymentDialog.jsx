import { useEffect, useMemo, useState } from 'react';
import {
  normalizePaymentAmount,
  paymentMethodLabel,
  validatePaymentAmount,
} from '../payment.js';

function paymentTime(value) {
  return new Intl.DateTimeFormat('es-GT', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function PaymentDialog({ order, busy, money, onClose, onPay }) {
  const [method, setMethod] = useState('efectivo');
  const [amount, setAmount] = useState(order.saldo);
  const error = useMemo(
    () => validatePaymentAmount(amount, order.saldo),
    [amount, order.saldo],
  );

  useEffect(() => {
    setAmount(order.saldo);
  }, [order.saldo]);

  useEffect(() => {
    function closeWithEscape(event) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', closeWithEscape);
    return () => window.removeEventListener('keydown', closeWithEscape);
  }, [busy, onClose]);

  function submit(event) {
    event.preventDefault();
    if (error || busy) return;
    onPay({ metodo: method, monto: normalizePaymentAmount(amount) });
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="payment-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-title">
        <header className="dialog-header">
          <div>
            <p className="eyebrow">CAJA · MESA {order.mesa_numero}</p>
            <h2 id="payment-title">Cobrar orden #{order.id}</h2>
          </div>
          <button className="icon-button" aria-label="Cerrar cobro" onClick={onClose} disabled={busy}>×</button>
        </header>

        <div className="payment-layout">
          <section className="bill-summary">
            <h3>Resumen de consumo</h3>
            <div className="bill-items">
              {order.items.map((item) => (
                <div className="bill-item" key={item.id}>
                  <span>{item.cantidad} × {item.producto_nombre}</span>
                  <strong>{money(item.subtotal)}</strong>
                </div>
              ))}
            </div>
            <dl className="balance-summary">
              <div><dt>Total</dt><dd>{money(order.total)}</dd></div>
              <div><dt>Pagado</dt><dd>{money(order.total_pagado)}</dd></div>
              <div className="balance-due"><dt>Saldo pendiente</dt><dd>{money(order.saldo)}</dd></div>
            </dl>

            {order.pagos.length > 0 && (
              <div className="payment-history">
                <h3>Pagos registrados</h3>
                {order.pagos.map((payment) => (
                  <div key={payment.id}>
                    <span>{paymentMethodLabel(payment.metodo)} · {paymentTime(payment.creado_at)}</span>
                    <strong>{money(payment.monto)}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>

          <form className="payment-form" onSubmit={submit}>
            <fieldset disabled={busy}>
              <legend>Método de pago</legend>
              <div className="method-options">
                {[
                  { value: 'efectivo', icon: 'Q', label: 'Efectivo' },
                  { value: 'tarjeta', icon: '▣', label: 'Tarjeta' },
                ].map((option) => (
                  <label className={method === option.value ? 'selected' : ''} key={option.value}>
                    <input
                      type="radio"
                      name="payment-method"
                      value={option.value}
                      checked={method === option.value}
                      onChange={() => setMethod(option.value)}
                    />
                    <span aria-hidden="true">{option.icon}</span>
                    <strong>{option.label}</strong>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="amount-field">
              Monto a registrar
              <span className="money-input">
                <span>Q</span>
                <input
                  autoFocus
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  aria-describedby="amount-help"
                  disabled={busy}
                />
              </span>
            </label>

            <div className="quick-amounts">
              <button type="button" onClick={() => setAmount(order.saldo)} disabled={busy}>
                Saldo completo
              </button>
              <button
                type="button"
                onClick={() => setAmount((Math.floor(Number(order.saldo) * 50) / 100).toFixed(2))}
                disabled={busy || Number(order.saldo) < 0.02}
              >
                Mitad
              </button>
            </div>

            <p id="amount-help" className={error ? 'field-error' : 'field-help'}>
              {error ?? 'Puedes registrar varios pagos hasta completar el saldo.'}
            </p>

            <div className="dialog-actions">
              <button type="button" className="secondary" onClick={onClose} disabled={busy}>Cancelar</button>
              <button type="submit" className="primary" disabled={Boolean(error) || busy}>
                {busy ? 'Registrando…' : `Registrar ${paymentMethodLabel(method).toLowerCase()}`}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}

export function PaymentReceipt({ receipt, money, onClose }) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="receipt-dialog" role="dialog" aria-modal="true" aria-labelledby="receipt-title">
        <div className="receipt-check" aria-hidden="true">✓</div>
        <p className="eyebrow">PAGO COMPLETADO</p>
        <h2 id="receipt-title">Orden #{receipt.correlativo}</h2>
        <p>La mesa {receipt.mesa_numero} quedó libre.</p>
        <div className="receipt-total">
          <span>Total cobrado</span>
          <strong>{money(receipt.total)}</strong>
        </div>
        <small>Correlativo del {receipt.fecha_correlativo}</small>
        <button className="primary" onClick={onClose} autoFocus>Continuar</button>
      </section>
    </div>
  );
}
