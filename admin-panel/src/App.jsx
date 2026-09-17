import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const currency = new Intl.NumberFormat('es-GT', {
  style: 'currency',
  currency: import.meta.env.VITE_CURRENCY || 'GTQ',
});

const roles = [
  ['mesero', 'Mesero'],
  ['cocina', 'Cocina'],
  ['cajero', 'Cajero'],
  ['admin', 'Administrador'],
];

const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Guatemala',
}).format(new Date());

const emptyProduct = () => ({
  nombre: '', descripcion: '', precio: '', imagen_url: null, categoria_id: '', activo: true,
});

const emptyCategory = () => ({ nombre: '', imagen_url: '', orden: 0 });
const emptyUser = () => ({ nombre: '', usuario: '', rol: 'mesero', activo: true });

function money(value) {
  return currency.format(Number(value ?? 0));
}

function dateTime(value) {
  return value ? new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(value)) : '—';
}

function App() {
  const [tab, setTab] = useState('catalogo');
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [productForm, setProductForm] = useState(emptyProduct);
  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [userForm, setUserForm] = useState(emptyUser);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [date, setDate] = useState(today);
  const [orders, setOrders] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const visibleProducts = useMemo(() => products.filter((product) => (
    categoryFilter === 'all' || String(product.categoria_id) === categoryFilter
  )), [products, categoryFilter]);

  function showMessage(text, type = 'success') {
    setMessage({ text, type });
  }

  function handleError(error) {
    showMessage(error.message ?? 'Ocurrió un error', 'error');
  }

  async function loadCatalog() {
    const [categoryData, productData] = await Promise.all([
      api('/categorias'),
      api('/productos'),
    ]);
    setCategories(categoryData);
    setProducts(productData);
  }

  async function loadUsers() {
    setUsers(await api('/usuarios'));
  }

  async function loadOrders() {
    setOrders(await api(`/ordenes/dia/${date}`));
  }

  async function loadReport() {
    setReport(await api(`/reportes/ventas-dia?fecha=${date}&limite=10`));
  }

  async function refresh() {
    setLoading(true);
    try {
      await loadCatalog();
      if (tab === 'usuarios') await loadUsers();
      if (tab === 'ordenes') await loadOrders();
      if (tab === 'reportes') await loadReport();
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (tab === 'usuarios') loadUsers().catch(handleError);
    if (tab === 'ordenes') loadOrders().catch(handleError);
    if (tab === 'reportes') loadReport().catch(handleError);
  }, [tab, date]);

  function editProduct(product) {
    setEditingProduct(product.id);
    setProductForm({
      nombre: product.nombre,
      descripcion: product.descripcion ?? '',
      precio: product.precio,
      imagen_url: product.imagen_url,
      categoria_id: product.categoria_id ?? '',
      activo: product.activo,
    });
    setImageFile(null);
  }

  function resetProduct() {
    setEditingProduct(null);
    setProductForm(emptyProduct());
    setImageFile(null);
  }

  async function saveProduct(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = {
        nombre: productForm.nombre,
        descripcion: productForm.descripcion || null,
        precio: Number(productForm.precio),
        imagen_url: productForm.imagen_url || null,
        categoria_id: productForm.categoria_id ? Number(productForm.categoria_id) : null,
        activo: productForm.activo,
      };
      const saved = await api(editingProduct ? `/productos/${editingProduct}` : '/productos', {
        method: editingProduct ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      const productId = editingProduct ?? saved.id;
      if (imageFile) {
        const formData = new FormData();
        formData.append('imagen', imageFile);
        await api(`/productos/${productId}/imagen`, { method: 'POST', body: formData });
      }
      await loadCatalog();
      resetProduct();
      showMessage('Producto guardado correctamente.');
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  async function toggleProduct(product) {
    setBusy(true);
    try {
      await api(`/productos/${product.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          nombre: product.nombre,
          descripcion: product.descripcion,
          precio: Number(product.precio),
          imagen_url: product.imagen_url,
          categoria_id: product.categoria_id,
          activo: !product.activo,
        }),
      });
      await loadCatalog();
      showMessage(product.activo ? 'Producto desactivado.' : 'Producto activado.');
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  function editCategory(category) {
    setEditingCategory(category.id);
    setCategoryForm({ nombre: category.nombre, imagen_url: category.imagen_url ?? '', orden: category.orden });
  }

  async function saveCategory(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(editingCategory ? `/categorias/${editingCategory}` : '/categorias', {
        method: editingCategory ? 'PUT' : 'POST',
        body: JSON.stringify({
          nombre: categoryForm.nombre,
          imagen_url: categoryForm.imagen_url || null,
          orden: Number(categoryForm.orden),
        }),
      });
      setEditingCategory(null);
      setCategoryForm(emptyCategory());
      await loadCatalog();
      showMessage('Categoría guardada correctamente.');
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(category) {
    if (!window.confirm(`¿Eliminar la categoría ${category.nombre}?`)) return;
    try {
      await api(`/categorias/${category.id}`, { method: 'DELETE' });
      await loadCatalog();
      showMessage('Categoría eliminada.');
    } catch (error) {
      handleError(error);
    }
  }

  function editUser(user) {
    setEditingUser(user.id);
    setUserForm({ nombre: user.nombre, usuario: user.usuario, rol: user.rol, activo: user.activo });
  }

  async function saveUser(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(editingUser ? `/usuarios/${editingUser}` : '/usuarios', {
        method: editingUser ? 'PUT' : 'POST',
        body: JSON.stringify(userForm),
      });
      setEditingUser(null);
      setUserForm(emptyUser());
      await loadUsers();
      showMessage('Usuario guardado. La autenticación se habilitará en la fase de producción.');
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }

  async function deactivateUser(user) {
    if (!window.confirm(`¿Desactivar a ${user.nombre}?`)) return;
    try {
      await api(`/usuarios/${user.id}`, { method: 'DELETE' });
      await loadUsers();
      showMessage('Usuario desactivado.');
    } catch (error) {
      handleError(error);
    }
  }

  const tabLabels = [
    ['catalogo', 'Catálogo'],
    ['ordenes', 'Órdenes'],
    ['reportes', 'Reportes'],
    ['usuarios', 'Usuarios'],
  ];

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">POS · ADMINISTRACIÓN</p>
          <h1>Centro de control</h1>
          <p className="header-subtitle">Catálogo, ventas y usuarios del restaurante.</p>
        </div>
        <div className="header-actions">
          <span className="status-pill"><span className="status-dot" /> Entorno local</span>
          <button className="ghost-button" onClick={refresh} disabled={loading}>Actualizar</button>
        </div>
      </header>

      {message && <div className={`notice ${message.type}`} role="status"><span>{message.text}</span><button onClick={() => setMessage(null)} aria-label="Cerrar">×</button></div>}

      <nav className="admin-nav" aria-label="Secciones administrativas">
        {tabLabels.map(([value, label]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>)}
      </nav>

      {tab === 'catalogo' && (
        <section className="catalog-layout">
          <aside className="panel category-panel">
            <div className="panel-heading"><div><p className="eyebrow">ORGANIZACIÓN</p><h2>Categorías</h2></div><span>{categories.length}</span></div>
            <button className={categoryFilter === 'all' ? 'category-row active' : 'category-row'} onClick={() => setCategoryFilter('all')}>Todos los productos</button>
            {categories.map((category) => <div className="category-line" key={category.id}><button className={categoryFilter === String(category.id) ? 'category-row active' : 'category-row'} onClick={() => setCategoryFilter(String(category.id))}>{category.nombre}</button><div><button className="mini-button" onClick={() => editCategory(category)} aria-label={`Editar ${category.nombre}`}>✎</button><button className="mini-button danger" onClick={() => deleteCategory(category)} aria-label={`Eliminar ${category.nombre}`}>×</button></div></div>)}
            <form className="compact-form" onSubmit={saveCategory}><h3>{editingCategory ? 'Editar categoría' : 'Nueva categoría'}</h3><input required placeholder="Nombre" value={categoryForm.nombre} onChange={(event) => setCategoryForm({ ...categoryForm, nombre: event.target.value })} /><div className="form-grid"><input type="number" min="0" placeholder="Orden" value={categoryForm.orden} onChange={(event) => setCategoryForm({ ...categoryForm, orden: event.target.value })} /><button className="primary" disabled={busy}>{editingCategory ? 'Guardar' : 'Agregar'}</button></div>{editingCategory && <button type="button" className="link-button" onClick={() => { setEditingCategory(null); setCategoryForm(emptyCategory()); }}>Cancelar edición</button>}</form>
          </aside>

          <section className="panel products-panel">
            <div className="panel-heading"><div><p className="eyebrow">CATÁLOGO</p><h2>Productos</h2></div><span>{visibleProducts.length} visibles</span></div>
            <div className="product-admin-grid">{visibleProducts.map((product) => <article className={!product.activo ? 'product-admin-card inactive' : 'product-admin-card'} key={product.id}>{product.imagen_url ? <img src={product.imagen_url} alt="" /> : <div className="image-placeholder">{product.nombre.slice(0, 1)}</div>}<div className="product-copy"><div className="product-title"><h3>{product.nombre}</h3><span className={product.activo ? 'active-label' : 'inactive-label'}>{product.activo ? 'Activo' : 'Inactivo'}</span></div><p>{product.categoria_nombre ?? 'Sin categoría'}</p><strong>{money(product.precio)}</strong></div><div className="card-actions"><button className="secondary-button" onClick={() => editProduct(product)}>Editar</button><button className="link-button" onClick={() => toggleProduct(product)}>{product.activo ? 'Desactivar' : 'Activar'}</button></div></article>)}{!visibleProducts.length && <p className="empty-state">No hay productos para este filtro.</p>}</div>
          </section>

          <form className="panel product-form" onSubmit={saveProduct}><div className="panel-heading"><div><p className="eyebrow">{editingProduct ? 'EDICIÓN' : 'NUEVO REGISTRO'}</p><h2>{editingProduct ? 'Editar producto' : 'Agregar producto'}</h2></div></div><label>Nombre<input required maxLength="160" value={productForm.nombre} onChange={(event) => setProductForm({ ...productForm, nombre: event.target.value })} /></label><label>Descripción<textarea rows="3" value={productForm.descripcion} onChange={(event) => setProductForm({ ...productForm, descripcion: event.target.value })} /></label><div className="form-grid"><label>Precio<input required type="number" min="0" step="0.01" value={productForm.precio} onChange={(event) => setProductForm({ ...productForm, precio: event.target.value })} /></label><label>Categoría<select value={productForm.categoria_id} onChange={(event) => setProductForm({ ...productForm, categoria_id: event.target.value })}><option value="">Sin categoría</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.nombre}</option>)}</select></label></div><label className="file-field">Imagen optimizada<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} /><small>{imageFile ? imageFile.name : 'JPG, PNG, WebP o GIF · máximo 5 MB'}</small></label><label className="check-field"><input type="checkbox" checked={productForm.activo} onChange={(event) => setProductForm({ ...productForm, activo: event.target.checked })} /> Producto activo</label><div className="form-actions"><button type="button" className="secondary-button" onClick={resetProduct}>Limpiar</button><button className="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar producto'}</button></div></form>
        </section>
      )}

      {tab === 'ordenes' && <section className="panel data-panel"><div className="panel-heading"><div><p className="eyebrow">HISTORIAL</p><h2>Órdenes cerradas</h2></div><label className="date-control">Fecha<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></div><div className="table-scroll"><table><thead><tr><th>Correlativo</th><th>Mesa</th><th>Mesero</th><th>Ítems</th><th>Total</th><th>Cobrado</th><th>Cierre</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>#{order.correlativo}</strong></td><td>Mesa {order.mesa_numero}</td><td>{order.usuario_nombre}</td><td>{order.cantidad_items}</td><td>{money(order.total)}</td><td>{money(order.total_pagado)}</td><td>{dateTime(order.fecha_cierre)}</td></tr>)}{!orders.length && <tr><td colSpan="7" className="empty-cell">No hay órdenes cerradas en esta fecha.</td></tr>}</tbody></table></div></section>}

      {tab === 'reportes' && <section className="reports-layout"><div className="panel report-toolbar"><div><p className="eyebrow">ANÁLISIS</p><h2>Ventas del día</h2></div><label className="date-control">Fecha<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></div>{report && <><div className="summary-grid"><div className="metric-card"><span>Ventas</span><strong>{money(report.resumen.ventas)}</strong><small>{report.resumen.ordenes} órdenes</small></div><div className="metric-card"><span>Total cobrado</span><strong>{money(report.resumen.cobrado)}</strong><small>Pagos registrados</small></div>{report.por_metodo.map((method) => <div className="metric-card" key={method.metodo}><span>{method.metodo === 'efectivo' ? 'Efectivo' : 'Tarjeta'}</span><strong>{money(method.total)}</strong><small>{method.pagos} pagos</small></div>)}</div><div className="report-columns"><section className="panel data-panel"><div className="panel-heading"><div><p className="eyebrow">PRODUCTIVIDAD</p><h2>Productos más vendidos</h2></div></div><div className="ranking-list">{report.productos_top.map((product, index) => <div className="ranking-row" key={product.id}><b>{index + 1}</b><div><strong>{product.nombre}</strong><small>{product.categoria_nombre ?? 'Sin categoría'} · {product.cantidad} unidades</small></div><strong>{money(product.total)}</strong></div>)}{!report.productos_top.length && <p className="empty-state">No hay ventas para esta fecha.</p>}</div></section><section className="panel data-panel"><div className="panel-heading"><div><p className="eyebrow">MÉTODOS</p><h2>Distribución de cobros</h2></div></div><div className="method-list">{report.por_metodo.map((method) => <div className="method-row" key={method.metodo}><div><strong>{method.metodo === 'efectivo' ? 'Efectivo' : 'Tarjeta'}</strong><small>{method.pagos} operaciones</small></div><strong>{money(method.total)}</strong></div>)}{!report.por_metodo.length && <p className="empty-state">No hay pagos para esta fecha.</p>}</div></section></div></>}</section>}

      {tab === 'usuarios' && <section className="users-layout"><section className="panel data-panel"><div className="panel-heading"><div><p className="eyebrow">ACCESOS</p><h2>Usuarios y roles</h2></div><span>{users.length} registros</span></div><div className="user-list">{users.map((user) => <div className={!user.activo ? 'user-row inactive' : 'user-row'} key={user.id}><div className="avatar">{user.nombre.slice(0, 1).toUpperCase()}</div><div className="user-copy"><strong>{user.nombre}</strong><small>@{user.usuario}</small></div><span className="role-badge">{roles.find(([value]) => value === user.rol)?.[1] ?? user.rol}</span><span className={user.activo ? 'active-label' : 'inactive-label'}>{user.activo ? 'Activo' : 'Inactivo'}</span><button className="secondary-button" onClick={() => editUser(user)}>Editar</button>{user.activo && <button className="link-button" onClick={() => deactivateUser(user)}>Desactivar</button>}</div>)}{!users.length && <p className="empty-state">No hay usuarios.</p>}</div></section><form className="panel user-form" onSubmit={saveUser}><div className="panel-heading"><div><p className="eyebrow">{editingUser ? 'EDICIÓN' : 'NUEVO REGISTRO'}</p><h2>{editingUser ? 'Editar usuario' : 'Agregar usuario'}</h2></div></div><p className="form-note">La contraseña y autenticación se habilitarán en la etapa de producción. Por ahora se administran identidad, rol y estado.</p><label>Nombre<input required value={userForm.nombre} onChange={(event) => setUserForm({ ...userForm, nombre: event.target.value })} /></label><label>Usuario<input required value={userForm.usuario} onChange={(event) => setUserForm({ ...userForm, usuario: event.target.value })} /></label><label>Rol<select value={userForm.rol} onChange={(event) => setUserForm({ ...userForm, rol: event.target.value })}>{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="check-field"><input type="checkbox" checked={userForm.activo} onChange={(event) => setUserForm({ ...userForm, activo: event.target.checked })} /> Usuario activo</label><div className="form-actions"><button type="button" className="secondary-button" onClick={() => { setEditingUser(null); setUserForm(emptyUser()); }}>Limpiar</button><button className="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar usuario'}</button></div></form></section>}
    </main>
  );
}

export default App;
