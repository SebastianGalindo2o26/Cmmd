import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { clearSession, getToken, getUser, saveSession } from './auth.js';
import { PaymentDialog, PaymentReceipt } from './components/PaymentDialog.jsx';
import { useSocket } from './hooks/useSocket.js';
import { enqueue, listPending, pendingCount, removePending } from './offlineQueue.js';

const currency = new Intl.NumberFormat('es-GT', {
  style: 'currency',
  currency: import.meta.env.VITE_CURRENCY || 'GTQ',
});

const quickNotes = ['Sin cebolla', 'Extra queso', 'Sin picante', 'Para llevar'];

function money(value) {
  return currency.format(Number(value ?? 0));
}

function operationKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `tablet-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function isNetworkError(error) {
  return !navigator.onLine || error?.name === 'TypeError' || error?.message === 'Failed to fetch';
}

function App() {
  const [tables, setTables] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [modifiers, setModifiers] = useState([]);
  const [categoryId, setCategoryId] = useState(null);
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState(null);
  const [cart, setCart] = useState([]);
  const [modifierProduct, setModifierProduct] = useState(null);
  const [modifierNote, setModifierNote] = useState('');
  const [modifierSelection, setModifierSelection] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pendingSync, setPendingSync] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginForm, setLoginForm] = useState({ usuario: '', password: '' });
  const [session, setSession] = useState(getUser);
  const [sessionToken, setSessionToken] = useState(getToken);
  const [userId, setUserId] = useState(() => Number(
    getUser()?.id || localStorage.getItem('pos_usuario_id') || import.meta.env.VITE_USUARIO_ID || 1,
  ));

  async function loadTables() {
    setTables(await api('/mesas'));
  }

  async function loadOrder(orderId) {
    const current = await api(`/ordenes/${orderId}`);
    setOrder(current);
    return current;
  }

  async function loadInitial() {
    try {
      const [tableData, categoryData, productData, modifierData] = await Promise.all([
        api('/mesas'),
        api('/categorias'),
        api('/productos?activo=true'),
        api('/modificadores?activo=true'),
      ]);
      setTables(tableData);
      setCategories(categoryData);
      setProducts(productData);
      setModifiers(modifierData);
      setCategoryId((current) => current ?? categoryData[0]?.id ?? null);
    } catch (error) {
      if (error.status === 401) setLoginOpen(true);
      showMessage(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInitial();
    pendingCount().then(setPendingSync).catch(() => {});
    function handleOnline() {
      setOnline(true);
      flushOfflineQueue();
    }
    function handleOffline() {
      setOnline(false);
      showMessage('Sin conexión. Las nuevas rondas se guardarán para sincronizarse.', 'info');
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const connected = useSocket({
    conexion_lista: () => {
      loadTables().catch(handleError);
      if (order?.id) loadOrder(order.id).catch(handleError);
    },
    mesa_actualizada: () => loadTables().catch(handleError),
    item_estado_cambiado: (payload) => {
      setOrder((current) => {
        if (!current || current.id !== payload.orden_id) return current;
        return {
          ...current,
          items: current.items.map((item) => item.id === payload.item_id
            ? { ...item, estado: payload.nuevo_estado }
            : item),
        };
      });
    },
    orden_actualizada: (payload) => {
      if (order?.id === payload.id) loadOrder(payload.id).catch(handleError);
    },
    pago_registrado: (payload) => {
      if (order?.id === payload.orden_id) loadOrder(payload.orden_id).catch(handleError);
    },
    orden_cerrada: (payload) => {
      if (order?.id === payload.id) {
        setReceipt({ ...payload, mesa_numero: order.mesa_numero });
        setPaymentOpen(false);
        setOrder(null);
        setCart([]);
        showMessage(`Orden #${payload.correlativo} cobrada; mesa liberada.`, 'success');
      }
      loadTables().catch(handleError);
    },
  }, {
    token: sessionToken,
    onAuthRequired: () => setLoginOpen(true),
  });

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return products.filter((product) => (
      product.categoria_id === categoryId
      && (!query || `${product.nombre} ${product.descripcion ?? ''}`.toLocaleLowerCase().includes(query))
    ));
  }, [products, categoryId, search]);

  const cartTotal = useMemo(
    () => cart.reduce((total, item) => total + Number(item.precio) * item.cantidad, 0),
    [cart],
  );

  const hasUnsentItems = order?.items?.some((item) => !item.enviado_cocina_at) ?? false;

  async function flushOfflineQueue() {
    if (!navigator.onLine || syncing) return;
    setSyncing(true);
    try {
      const pending = await listPending();
      let completed = 0;
      for (const operation of pending) {
        try {
          await api(operation.path, {
            method: operation.method,
            ...(operation.body ? { body: JSON.stringify(operation.body) } : {}),
            headers: { 'Idempotency-Key': operation.key },
          });
          await removePending(operation.id);
          completed += 1;
        } catch (error) {
          if (!isNetworkError(error)) {
            showMessage(`No se pudo sincronizar una operación pendiente: ${error.message}`, 'error');
          }
          break;
        }
      }
      const remaining = await pendingCount();
      setPendingSync(remaining);
      if (completed > 0) {
        showMessage(`${completed} operación${completed === 1 ? '' : 'es'} offline sincronizada${completed === 1 ? '' : 's'}.`, 'success');
        if (order?.id) await loadOrder(order.id).catch(() => {});
        await loadTables().catch(() => {});
      }
    } finally {
      setSyncing(false);
    }
  }

  function showMessage(text, type = 'info') {
    setMessage({ text, type });
  }

  function handleError(error) {
    if (error.status === 401) {
      setLoginOpen(true);
      showMessage('Inicia sesión para continuar.', 'info');
      return;
    }
    showMessage(error.message ?? 'Ocurrió un error', 'error');
  }

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify(loginForm),
      });
      if (!['mesero', 'cajero', 'admin'].includes(result.usuario.rol)) {
        throw new Error('Esta cuenta no tiene permisos para usar la tablet.');
      }
      saveSession(result);
      setSession(result.usuario);
      setSessionToken(result.token);
      saveUserId(result.usuario.id);
      setLoginOpen(false);
      setLoginForm({ usuario: '', password: '' });
      showMessage(`Sesión iniciada como ${result.usuario.nombre}.`, 'success');
      await loadInitial();
    } catch (error) {
      showMessage(error.message ?? 'No se pudo iniciar sesión', 'error');
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    clearSession();
    setSession(null);
    setSessionToken(null);
    setOrder(null);
    setCart([]);
    setPaymentOpen(false);
    showMessage('Sesión cerrada.', 'info');
  }

  function saveUserId(value) {
    const next = Number(value);
    setUserId(next);
    if (Number.isInteger(next) && next > 0) {
      localStorage.setItem('pos_usuario_id', String(next));
    }
  }

  async function selectTable(table) {
    if (busy) return;
    if (!Number.isInteger(userId) || userId <= 0) {
      showMessage('Ingresa un ID de usuario válido.', 'error');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const selected = table.estado === 'ocupada'
        ? await api(`/ordenes/${table.orden_abierta_id}`)
        : await api(`/mesas/${table.id}/abrir`, {
          method: 'POST',
          body: JSON.stringify({ usuario_id: userId }),
        });
      setOrder(selected);
      setCart([]);
      setPaymentOpen(false);
      await loadTables();
    } catch (error) {
      handleError(error);
      await loadTables().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  function addProduct(product, notas = '', selectedModifiers = []) {
    if (!order) {
      showMessage('Selecciona una mesa antes de agregar productos.', 'error');
      return;
    }
    setCart((current) => {
      const modifierKey = selectedModifiers.map((modifier) => modifier.id).sort().join(',');
      const existing = current.find((item) => item.producto_id === product.id
        && item.notas === notas
        && item.modificadores.map((modifier) => modifier.id).sort().join(',') === modifierKey);
      if (existing) {
        return current.map((item) => item.producto_id === product.id
          && item.notas === notas
          && item.modificadores.map((modifier) => modifier.id).sort().join(',') === modifierKey
          ? { ...item, cantidad: item.cantidad + 1 }
          : item);
      }
      return [...current, {
        lineId: `${product.id}-${Date.now()}-${Math.random()}`,
        producto_id: product.id,
        nombre: product.nombre,
        precio: (Number(product.precio) + selectedModifiers.reduce((sum, modifier) => sum + Number(modifier.precio_extra), 0)).toFixed(2),
        cantidad: 1,
        notas,
        modificadores: selectedModifiers,
      }];
    });
  }

  function openProduct(product) {
    if (!order) {
      showMessage('Selecciona una mesa antes de agregar productos.', 'error');
      return;
    }
    setModifierProduct(product);
    setModifierNote('');
    setModifierSelection([]);
  }

  function confirmProduct() {
    if (!modifierProduct) return;
    addProduct(modifierProduct, notesOrNull(modifierNote) ?? '', modifierSelection);
    setModifierProduct(null);
    setModifierNote('');
    setModifierSelection([]);
  }

  function addQuickNote(lineId, note) {
    setCart((current) => current.map((item) => {
      if (item.lineId !== lineId) return item;
      const notes = item.notas ? `${item.notas}, ${note}` : note;
      return { ...item, notas: notes.slice(0, 500) };
    }));
  }

  function updateCartItem(lineId, changes) {
    setCart((current) => current
      .map((item) => item.lineId === lineId ? { ...item, ...changes } : item)
      .filter((item) => item.cantidad > 0));
  }

  async function sendToKitchen() {
    if (!order || (!cart.length && !hasUnsentItems) || busy) return;
    const orderId = order.id;
    const items = cart.map(({ producto_id, cantidad, notas, modificadores }) => ({
      producto_id,
      cantidad,
      notas: notesOrNull(notas),
      modificadores: modificadores.map((modifier) => modifier.id),
    }));
    const itemOperation = cart.length ? {
      orderId,
      path: `/ordenes/${orderId}/items`,
      method: 'POST',
      body: { items },
      key: operationKey(),
    } : null;
    const sendOperation = {
      orderId,
      path: `/ordenes/${orderId}/enviar-cocina`,
      method: 'POST',
      body: null,
      key: operationKey(),
    };
    setBusy(true);
    setMessage(null);
    try {
      if (cart.length) {
        await api(itemOperation.path, {
          method: 'POST',
          body: JSON.stringify(itemOperation.body),
          headers: { 'Idempotency-Key': itemOperation.key },
        });
        setCart([]);
      }
      const sent = await api(sendOperation.path, {
        method: 'POST',
        headers: { 'Idempotency-Key': sendOperation.key },
      });
      await loadOrder(orderId);
      showMessage(
        sent.evento === 'nueva_orden' ? 'Orden enviada a cocina.' : 'Nueva ronda enviada a cocina.',
        'success',
      );
    } catch (error) {
      if (isNetworkError(error)) {
        if (itemOperation) await enqueue(itemOperation);
        await enqueue(sendOperation);
        setCart([]);
        setPendingSync(await pendingCount());
        showMessage('Sin conexión: la ronda quedó guardada y se enviará automáticamente al volver la red.', 'info');
      } else {
        handleError(error);
        if (order?.id) loadOrder(order.id).catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  }

  function notesOrNull(notes) {
    const trimmed = notes.trim();
    return trimmed || null;
  }

  function openPayment() {
    if (!order || busy) return;
    if (cart.length || hasUnsentItems) {
      showMessage('Envía a cocina todos los productos antes de cobrar.', 'error');
      return;
    }
    if (Number(order.total) <= 0) {
      showMessage('Agrega productos antes de cobrar la orden.', 'error');
      return;
    }
    setMessage(null);
    setPaymentOpen(true);
  }

  async function registerPayment(payment) {
    if (!order || busy) return;
    const currentOrder = order;
    setBusy(true);
    setMessage(null);
    try {
      const result = await api(`/ordenes/${currentOrder.id}/pagos`, {
        method: 'POST',
        body: JSON.stringify(payment),
      });

      if (result.orden_cerrada) {
        setReceipt({ ...result.orden_cerrada, mesa_numero: currentOrder.mesa_numero });
        setPaymentOpen(false);
        setOrder(null);
        setCart([]);
        await loadTables();
        showMessage(
          `Orden #${result.orden_cerrada.correlativo} cobrada; mesa liberada.`,
          'success',
        );
      } else {
        await loadOrder(currentOrder.id);
        showMessage(`Pago registrado. Saldo pendiente: ${money(result.saldo)}.`, 'success');
      }
    } catch (error) {
      handleError(error);
      await loadOrder(currentOrder.id).catch(() => {
        setPaymentOpen(false);
        setOrder(null);
      });
      await loadTables().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">POS · MESERO</p>
          <h1>{order ? `Mesa ${order.mesa_numero}` : 'Selecciona una mesa'}</h1>
          <p className="topbar-subtitle">Toca un producto para agregarlo a la ronda actual</p>
        </div>
        <div className="topbar-actions">
          <label className="user-field">
            Usuario ID
            <input
              type="number"
              min="1"
              value={Number.isNaN(userId) ? '' : userId}
              onChange={(event) => saveUserId(event.target.value)}
              disabled={Boolean(order || session)}
            />
          </label>
          <span className={`connection ${connected && online ? 'online' : 'offline'}`}>
            {online ? (connected ? 'En línea' : 'Reconectando') : 'Sin conexión'}
          </span>
          {session && <span className="session-pill">{session.nombre}</span>}
          {session
            ? <button className="secondary" onClick={logout}>Salir</button>
            : <button className="secondary" onClick={() => setLoginOpen(true)}>Acceder</button>}
          {(pendingSync > 0 || syncing) && <span className="sync-status">{syncing ? 'Sincronizando…' : `${pendingSync} pendiente${pendingSync === 1 ? '' : 's'}`}</span>}
          {order && (
            <>
              <button
                className="charge-button"
                onClick={openPayment}
                disabled={busy || Number(order.total) <= 0}
                title={cart.length || hasUnsentItems ? 'Envía primero los productos a cocina' : ''}
              >
                Cobrar {Number(order.saldo) > 0 ? money(order.saldo) : ''}
              </button>
              <button
                className="secondary"
                onClick={() => { setOrder(null); setCart([]); setPaymentOpen(false); }}
              >
                Cambiar mesa
              </button>
            </>
          )}
        </div>
      </header>

      {message && (
        <div className={`notice ${message.type}`} role="status">
          <span>{message.text}</span>
          <button aria-label="Cerrar mensaje" onClick={() => setMessage(null)}>×</button>
        </div>
      )}

      {!order && <section className="table-picker-heading"><div><p className="eyebrow">INICIO RÁPIDO</p><h2>Elige una mesa para comenzar</h2></div><span>{tables.filter((table) => table.estado === 'libre').length} libres</span></section>}
      <section className="tables-strip" aria-label="Mesas">
        {loading && <p>Cargando mesas…</p>}
        {!loading && !tables.length && <p>No hay mesas. Créelas desde la API antes de comenzar.</p>}
        {tables.map((table) => (
          <button
            key={table.id}
            className={`table-button ${table.estado} ${order?.mesa_id === table.id ? 'selected' : ''}`}
            onClick={() => selectTable(table)}
            disabled={busy || (table.estado === 'ocupada' && !table.orden_abierta_id)}
          >
            <strong>Mesa {table.numero}</strong>
            <span>{table.estado === 'libre' ? 'Libre' : 'Continuar orden'}</span>
          </button>
        ))}
      </section>

      <section className={`workspace ${!order ? 'disabled' : ''}`}>
        <nav className="categories" aria-label="Categorías">
          <h2>Categorías</h2>
          {categories.map((category) => (
            <button
              key={category.id}
              className={category.id === categoryId ? 'active' : ''}
              onClick={() => setCategoryId(category.id)}
            >
              {category.nombre}
            </button>
          ))}
        </nav>

        <section className="products">
          <div className="section-heading product-heading">
            <div>
              <p className="eyebrow">MENÚ</p>
              <h2>{categories.find((item) => item.id === categoryId)?.nombre ?? 'Productos'}</h2>
            </div>
            <div className="search-field">
              <span className="sr-only">Buscar producto</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto" />
              {search && <button type="button" onClick={() => setSearch('')} aria-label="Limpiar búsqueda">×</button>}
            </div>
          </div>
          <div className="product-grid">
            {visibleProducts.map((product) => (
              <button key={product.id} className="product-card" onClick={() => openProduct(product)} aria-label={`Agregar ${product.nombre}`}>
                {product.imagen_url
                  ? <img src={product.imagen_url} alt="" loading="lazy" />
                  : <span className="product-placeholder">{product.nombre.slice(0, 1)}</span>}
                <strong>{product.nombre}</strong>
                {product.descripcion && <small>{product.descripcion}</small>}
                <span>{money(product.precio)}</span>
              </button>
            ))}
            {!visibleProducts.length && <p className="empty">No hay productos que coincidan con la búsqueda.</p>}
          </div>
        </section>

        <aside className="order-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ORDEN ACTUAL</p>
              <h2>{order ? `#${order.id}` : 'Sin mesa'}</h2>
            </div>
            {order && <span>{order.items.length} guardados</span>}
          </div>

          <div className="order-items">
            {order?.items.map((item) => (
              <article className="saved-item" key={item.id}>
                <div>
                  <strong>{item.cantidad} × {item.producto_nombre}</strong>
                  {item.modificadores?.length > 0 && <small>Extra: {item.modificadores.map((modifier) => modifier.nombre).join(', ')}</small>}
                  {item.notas && <small>{item.notas}</small>}
                </div>
                <span className={`status ${item.estado}`}>{item.estado}</span>
              </article>
            ))}

            {cart.map((item) => (
              <article className="cart-item" key={item.lineId}>
                <div className="cart-line">
                  <strong>{item.nombre}</strong>
                  <span>{money(Number(item.precio) * item.cantidad)}</span>
                </div>
                {item.modificadores?.length > 0 && <small>Extra: {item.modificadores.map((modifier) => modifier.nombre).join(', ')}</small>}
                <div className="quantity">
                  <button type="button" onClick={() => updateCartItem(item.lineId, { cantidad: item.cantidad - 1 })}>−</button>
                  <span>{item.cantidad}</span>
                  <button type="button" onClick={() => updateCartItem(item.lineId, { cantidad: item.cantidad + 1 })}>+</button>
                </div>
                <input
                  value={item.notas}
                  maxLength="500"
                  placeholder="Nota para cocina"
                  onChange={(event) => updateCartItem(item.lineId, { notas: event.target.value })}
                />
                <div className="quick-notes" aria-label="Modificadores rápidos">
                  {quickNotes.map((note) => <button type="button" key={note} onClick={() => addQuickNote(item.lineId, note)}>{note}</button>)}
                </div>
              </article>
            ))}

            {order && !order.items.length && !cart.length && (
              <p className="empty">Toca un producto para comenzar la orden.</p>
            )}
          </div>

          <footer className="order-footer">
            {cart.length > 0 && (
              <div className="total secondary-total">
                <span>Ronda nueva</span>
                <strong>{money(cartTotal)}</strong>
              </div>
            )}
            <div className="total">
              <span>Total guardado</span>
              <strong>{money(order?.total)}</strong>
            </div>
            {order && Number(order.total_pagado) > 0 && (
              <>
                <div className="total paid-total">
                  <span>Pagado</span>
                  <strong>{money(order.total_pagado)}</strong>
                </div>
                <div className="total balance-total">
                  <span>Saldo</span>
                  <strong>{money(order.saldo)}</strong>
                </div>
              </>
            )}
            <button
              className="primary send-button"
              disabled={!order || busy || (!cart.length && !hasUnsentItems)}
              onClick={sendToKitchen}
            >
              {busy ? 'Procesando…' : 'Enviar a cocina'}
            </button>
          </footer>
        </aside>
      </section>

      {paymentOpen && order && (
        <PaymentDialog
          order={order}
          busy={busy}
          money={money}
          onClose={() => setPaymentOpen(false)}
          onPay={registerPayment}
        />
      )}

      {modifierProduct && (
        <div className="dialog-backdrop" role="presentation">
          <section className="modifier-dialog" role="dialog" aria-modal="true" aria-labelledby="modifier-title">
            <header className="dialog-header">
              <div><p className="eyebrow">NUEVA LÍNEA</p><h2 id="modifier-title">{modifierProduct.nombre}</h2></div>
              <button className="icon-button" aria-label="Cerrar producto" onClick={() => setModifierProduct(null)}>×</button>
            </header>
            <div className="modifier-content">
              <p className="modifier-help">Elige modificadores con precio o escribe una nota para cocina.</p>
              {modifiers.filter((modifier) => modifier.producto_id === modifierProduct.id).length > 0 && (
                <div className="paid-modifier-options">
                  {modifiers.filter((modifier) => modifier.producto_id === modifierProduct.id).map((modifier) => {
                    const selected = modifierSelection.some((item) => item.id === modifier.id);
                    return <button type="button" className={selected ? 'selected' : ''} key={modifier.id} onClick={() => setModifierSelection((current) => selected ? current.filter((item) => item.id !== modifier.id) : [...current, modifier])}>
                      {modifier.nombre} · +{money(modifier.precio_extra)}
                    </button>;
                  })}
                </div>
              )}
              <div className="modifier-options">
                {quickNotes.map((note) => <button type="button" key={note} onClick={() => setModifierNote((current) => current ? `${current}, ${note}` : note)}>{note}</button>)}
              </div>
              <label className="modifier-input">Nota personalizada<textarea rows="3" maxLength="500" value={modifierNote} onChange={(event) => setModifierNote(event.target.value)} placeholder="Ej. salsa aparte" /></label>
              <div className="dialog-actions"><button type="button" className="secondary" onClick={() => setModifierProduct(null)}>Cancelar</button><button type="button" className="primary" onClick={confirmProduct}>Agregar · {money(Number(modifierProduct.precio) + modifierSelection.reduce((sum, modifier) => sum + Number(modifier.precio_extra), 0))}</button></div>
            </div>
          </section>
        </div>
      )}

      {receipt && (
        <PaymentReceipt receipt={receipt} money={money} onClose={() => setReceipt(null)} />
      )}

      {loginOpen && (
        <div className="dialog-backdrop" role="presentation">
          <form className="admin-login-dialog" onSubmit={login}>
            <p className="eyebrow">ACCESO DE OPERADOR</p>
            <h2>Iniciar sesión</h2>
            <p className="modifier-help">Usa una cuenta de mesero, cajero o administrador.</p>
            <label>Usuario<input required autoFocus value={loginForm.usuario} onChange={(event) => setLoginForm({ ...loginForm, usuario: event.target.value })} /></label>
            <label>Contraseña<input required type="password" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} /></label>
            <div className="dialog-actions"><button type="button" className="secondary" onClick={() => setLoginOpen(false)}>Cancelar</button><button className="primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button></div>
          </form>
        </div>
      )}
    </main>
  );
}

export default App;
