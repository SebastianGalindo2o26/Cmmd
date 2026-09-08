import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { useSocket } from './hooks/useSocket.js';

const currency = new Intl.NumberFormat('es-GT', {
  style: 'currency',
  currency: import.meta.env.VITE_CURRENCY || 'GTQ',
});

function money(value) {
  return currency.format(Number(value ?? 0));
}

function App() {
  const [tables, setTables] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [categoryId, setCategoryId] = useState(null);
  const [order, setOrder] = useState(null);
  const [cart, setCart] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [userId, setUserId] = useState(() => Number(
    localStorage.getItem('pos_usuario_id') || import.meta.env.VITE_USUARIO_ID || 1,
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
      const [tableData, categoryData, productData] = await Promise.all([
        api('/mesas'),
        api('/categorias'),
        api('/productos?activo=true'),
      ]);
      setTables(tableData);
      setCategories(categoryData);
      setProducts(productData);
      setCategoryId((current) => current ?? categoryData[0]?.id ?? null);
    } catch (error) {
      showMessage(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInitial();
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
    orden_cerrada: (payload) => {
      if (order?.id === payload.id) {
        setOrder(null);
        setCart([]);
        showMessage(`Orden #${payload.correlativo} cobrada; mesa liberada.`, 'success');
      }
      loadTables().catch(handleError);
    },
  });

  const visibleProducts = useMemo(
    () => products.filter((product) => product.categoria_id === categoryId),
    [products, categoryId],
  );

  const cartTotal = useMemo(
    () => cart.reduce((total, item) => total + Number(item.precio) * item.cantidad, 0),
    [cart],
  );

  const hasUnsentItems = order?.items?.some((item) => !item.enviado_cocina_at) ?? false;

  function showMessage(text, type = 'info') {
    setMessage({ text, type });
  }

  function handleError(error) {
    showMessage(error.message ?? 'Ocurrió un error', 'error');
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
      await loadTables();
    } catch (error) {
      handleError(error);
      await loadTables().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  function addProduct(product) {
    if (!order) {
      showMessage('Selecciona una mesa antes de agregar productos.', 'error');
      return;
    }
    setCart((current) => {
      const existing = current.find((item) => item.producto_id === product.id);
      if (existing) {
        return current.map((item) => item.producto_id === product.id
          ? { ...item, cantidad: item.cantidad + 1 }
          : item);
      }
      return [...current, {
        producto_id: product.id,
        nombre: product.nombre,
        precio: product.precio,
        cantidad: 1,
        notas: '',
      }];
    });
  }

  function updateCartItem(productId, changes) {
    setCart((current) => current
      .map((item) => item.producto_id === productId ? { ...item, ...changes } : item)
      .filter((item) => item.cantidad > 0));
  }

  async function sendToKitchen() {
    if (!order || (!cart.length && !hasUnsentItems) || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      if (cart.length) {
        await api(`/ordenes/${order.id}/items`, {
          method: 'POST',
          body: JSON.stringify({
            items: cart.map(({ producto_id, cantidad, notas }) => ({
              producto_id,
              cantidad,
              notas: notesOrNull(notas),
            })),
          }),
        });
        setCart([]);
      }
      const sent = await api(`/ordenes/${order.id}/enviar-cocina`, { method: 'POST' });
      await loadOrder(order.id);
      showMessage(
        sent.evento === 'nueva_orden' ? 'Orden enviada a cocina.' : 'Nueva ronda enviada a cocina.',
        'success',
      );
    } catch (error) {
      handleError(error);
      if (order?.id) loadOrder(order.id).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  function notesOrNull(notes) {
    const trimmed = notes.trim();
    return trimmed || null;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">POS · MESERO</p>
          <h1>{order ? `Mesa ${order.mesa_numero}` : 'Selecciona una mesa'}</h1>
        </div>
        <div className="topbar-actions">
          <label className="user-field">
            Usuario ID
            <input
              type="number"
              min="1"
              value={Number.isNaN(userId) ? '' : userId}
              onChange={(event) => saveUserId(event.target.value)}
              disabled={Boolean(order)}
            />
          </label>
          <span className={`connection ${connected ? 'online' : 'offline'}`}>
            {connected ? 'En línea' : 'Sin tiempo real'}
          </span>
          {order && (
            <button className="secondary" onClick={() => { setOrder(null); setCart([]); }}>
              Cambiar mesa
            </button>
          )}
        </div>
      </header>

      {message && (
        <div className={`notice ${message.type}`} role="status">
          <span>{message.text}</span>
          <button aria-label="Cerrar mensaje" onClick={() => setMessage(null)}>×</button>
        </div>
      )}

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
          <div className="section-heading">
            <div>
              <p className="eyebrow">MENÚ</p>
              <h2>{categories.find((item) => item.id === categoryId)?.nombre ?? 'Productos'}</h2>
            </div>
            <span>{visibleProducts.length} productos</span>
          </div>
          <div className="product-grid">
            {visibleProducts.map((product) => (
              <button key={product.id} className="product-card" onClick={() => addProduct(product)}>
                {product.imagen_url
                  ? <img src={product.imagen_url} alt="" />
                  : <span className="product-placeholder">{product.nombre.slice(0, 1)}</span>}
                <strong>{product.nombre}</strong>
                <span>{money(product.precio)}</span>
              </button>
            ))}
            {!visibleProducts.length && <p className="empty">No hay productos activos en esta categoría.</p>}
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
                  {item.notas && <small>{item.notas}</small>}
                </div>
                <span className={`status ${item.estado}`}>{item.estado}</span>
              </article>
            ))}

            {cart.map((item) => (
              <article className="cart-item" key={item.producto_id}>
                <div className="cart-line">
                  <strong>{item.nombre}</strong>
                  <span>{money(Number(item.precio) * item.cantidad)}</span>
                </div>
                <div className="quantity">
                  <button onClick={() => updateCartItem(item.producto_id, { cantidad: item.cantidad - 1 })}>−</button>
                  <span>{item.cantidad}</span>
                  <button onClick={() => updateCartItem(item.producto_id, { cantidad: item.cantidad + 1 })}>+</button>
                </div>
                <input
                  value={item.notas}
                  maxLength="500"
                  placeholder="Nota para cocina"
                  onChange={(event) => updateCartItem(item.producto_id, { notas: event.target.value })}
                />
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
    </main>
  );
}

export default App;
