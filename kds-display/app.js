import Alpine from 'alpinejs';
import { io } from 'socket.io-client';

const apiBase = import.meta.env.VITE_API_URL || '/api';
const currency = new Intl.NumberFormat('es-GT', {
  style: 'currency',
  currency: import.meta.env.VITE_CURRENCY || 'GTQ',
});

async function api(path, options = {}) {
  const token = localStorage.getItem('pos_auth_token');
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(body?.error ?? 'No se pudo completar la solicitud');
    error.status = response.status;
    throw error;
  }
  return body;
}

Alpine.data('kds', () => ({
  orders: [],
  connected: false,
  session: null,
  loginOpen: false,
  loginForm: { usuario: '', password: '' },
  loginBusy: false,
  loading: true,
  notice: null,
  busyItems: [],
  now: Date.now(),
  socket: null,
  timer: null,

  get clock() {
    return new Intl.DateTimeFormat('es-GT', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(this.now);
  },

  get pendingItems() {
    return this.orders.flatMap((order) => order.items)
      .filter((item) => !['listo', 'entregado'].includes(item.estado)).length;
  },

  get readyItems() {
    return this.orders.flatMap((order) => order.items)
      .filter((item) => item.estado === 'listo').length;
  },

  async init() {
    try { this.session = JSON.parse(localStorage.getItem('pos_auth_user') ?? 'null'); } catch { this.session = null; }
    this.connectSocket();
    await this.loadOrders();
    this.timer = setInterval(() => { this.now = Date.now(); }, 1_000);
  },

  connectSocket() {
    this.socket?.close();
    const token = localStorage.getItem('pos_auth_token');
    this.socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
      query: { tipo: 'kds' },
      auth: token ? { token } : {},
    });
    this.socket.on('connect', () => {
      this.connected = true;
      this.loadOrders();
    });
    this.socket.on('disconnect', () => { this.connected = false; });
    this.socket.on('connect_error', (error) => {
      this.connected = false;
      if (error.message === 'auth_required' || error.message === 'role_forbidden') {
        this.loginOpen = true;
        this.showNotice('Inicia sesión con una cuenta de cocina o administrador.', 'error');
      }
    });
    this.socket.on('nueva_orden', (payload) => {
      this.mergeRound(payload, true);
      this.showNotice(`Nueva orden · Mesa ${payload.mesa_numero}`, 'new');
    });
    this.socket.on('orden_actualizada', (payload) => {
      this.mergeRound(payload, true);
      this.showNotice(`Nueva ronda · Mesa ${payload.mesa_numero}`, 'round');
    });
    this.socket.on('orden_cerrada', (payload) => {
      this.orders = this.orders.filter((order) => order.id !== payload.id);
      this.showNotice(`Orden #${payload.correlativo} cerrada`, 'closed');
    });
  },

  async loadOrders() {
    this.loading = true;
    const startedAt = Date.now();
    try {
      const active = await api('/ordenes/cocina/activas');
      for (const order of active) this.mergeRound(order);
      const activeIds = new Set(active.map((order) => order.id));
      this.orders = this.orders.filter((order) => (
        activeIds.has(order.id) || (order._socketReceivedAt ?? 0) >= startedAt
      ));
    } catch (error) {
      if (error.status === 401) this.loginOpen = true;
      this.showNotice(error.message, 'error');
    } finally {
      this.loading = false;
    }
  },

  mergeRound(payload, fromSocket = false) {
    const existing = this.orders.find((order) => order.id === payload.id);
    if (!existing) {
      this.orders.push({
        ...payload,
        items: [...payload.items],
        _socketReceivedAt: fromSocket ? Date.now() : 0,
      });
    } else {
      existing.total = payload.total;
      existing.mesa_numero = payload.mesa_numero;
      existing.fecha_apertura = payload.fecha_apertura ?? existing.fecha_apertura;
      const knownIds = new Set(existing.items.map((item) => item.id));
      existing.items.push(...payload.items.filter((item) => !knownIds.has(item.id)));
      if (fromSocket) existing._socketReceivedAt = Date.now();
    }
    this.orders.sort((left, right) => new Date(left.fecha_apertura) - new Date(right.fecha_apertura));
  },

  async advance(order, item) {
    const estado = this.nextState(item.estado);
    if (!estado || this.busyItems.includes(item.id)) return;
    this.busyItems.push(item.id);
    try {
      const result = await api(`/ordenes/${order.id}/items/${item.id}/estado`, {
        method: 'PATCH',
        body: JSON.stringify({ estado }),
      });
      item.estado = result.nuevo_estado;
    } catch (error) {
      this.showNotice(error.message, 'error');
      await this.loadOrders();
    } finally {
      this.busyItems = this.busyItems.filter((id) => id !== item.id);
    }
  },

  async login() {
    this.loginBusy = true;
    try {
      const result = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify(this.loginForm),
      });
      if (!['cocina', 'admin'].includes(result.usuario.rol)) {
        throw new Error('Esta cuenta no tiene permisos para usar cocina.');
      }
      localStorage.setItem('pos_auth_token', result.token);
      localStorage.setItem('pos_auth_user', JSON.stringify(result.usuario));
      this.session = result.usuario;
      this.loginForm = { usuario: '', password: '' };
      this.loginOpen = false;
      this.showNotice(`Sesión iniciada como ${result.usuario.nombre}.`, 'new');
      this.connectSocket();
      await this.loadOrders();
    } catch (error) {
      this.showNotice(error.message ?? 'No se pudo iniciar sesión', 'error');
    } finally {
      this.loginBusy = false;
    }
  },

  logout() {
    localStorage.removeItem('pos_auth_token');
    localStorage.removeItem('pos_auth_user');
    this.session = null;
    this.orders = [];
    this.connected = false;
    this.socket?.close();
    this.showNotice('Sesión cerrada.', 'round');
  },

  nextState(state) {
    return { pendiente: 'preparando', preparando: 'listo', listo: 'entregado' }[state] ?? null;
  },

  actionLabel(state) {
    return {
      pendiente: 'Empezar',
      preparando: 'Marcar listo',
      listo: 'Entregar',
    }[state] ?? '';
  },

  statusLabel(state) {
    return {
      pendiente: 'Pendiente',
      preparando: 'Preparando',
      listo: 'Listo',
      entregado: 'Entregado',
    }[state] ?? state;
  },

  allDelivered(order) {
    return order.items.length > 0 && order.items.every((item) => item.estado === 'entregado');
  },

  elapsed(order) {
    const seconds = Math.max(0, Math.floor((this.now - new Date(order.fecha_apertura)) / 1000));
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  },

  elapsedClass(order) {
    const minutes = (this.now - new Date(order.fecha_apertura)) / 60_000;
    if (minutes >= 20) return 'late';
    if (minutes >= 10) return 'warning';
    return '';
  },

  formatMoney(value) {
    return currency.format(Number(value ?? 0));
  },

  showNotice(text, type) {
    this.notice = { text, type };
  },
}));

window.Alpine = Alpine;
Alpine.start();
