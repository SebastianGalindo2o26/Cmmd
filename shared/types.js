/**
 * Contratos de datos compartidos. Son JSDoc para que los proyectos JavaScript
 * obtengan autocompletado sin introducir una compilación TypeScript todavía.
 */

/** @typedef {{ id: number, nombre: string, imagen_url: string|null, orden: number }} Categoria */
/** @typedef {{ id: number, nombre: string, descripcion: string|null, precio: string, imagen_url: string|null, categoria_id: number|null, activo: boolean }} Producto */
/** @typedef {'libre'|'ocupada'} EstadoMesa */
/** @typedef {{ id: number, numero: number, estado: EstadoMesa, orden_abierta_id: number|null }} Mesa */
/** @typedef {'pendiente'|'preparando'|'listo'|'entregado'} EstadoItem */
/** @typedef {'abierta'|'pagada'|'cancelada'} EstadoOrden */
/** @typedef {{ id: number, producto_id: number, producto_nombre: string, cantidad: number, notas: string|null, precio_unitario: string, subtotal: string, estado: EstadoItem, enviado_cocina_at: string|null }} ItemOrden */
/** @typedef {{ id: number, orden_id: number, metodo: 'efectivo'|'tarjeta', monto: string, creado_at: string }} Pago */
/** @typedef {{ id: number, mesa_id: number, mesa_numero: number, usuario_id: number, correlativo: number|null, fecha_correlativo: string|null, estado: EstadoOrden, total: string, total_pagado: string, saldo: string, items: ItemOrden[], pagos: Pago[] }} Orden */
/** @typedef {{ orden_id: number, pago: Pago, total: string, total_pagado: string, saldo: string }} PagoRegistrado */
/** @typedef {{ id: number, mesa_id: number, mesa_numero: number, total: string, fecha_apertura: string, items: ItemOrden[] }} OrdenCocina */

export {};
