# Plan de Desarrollo — Sistema POS de Restaurante

## 1. Resumen del proyecto

Sistema de punto de venta para un restaurante con tres frentes de trabajo:

- **Tablet (mesero/cajero):** toma la orden por mesa, la envía a cocina, permite agregar productos en rondas mientras la mesa sigue abierta, y cobra al final generando un correlativo diario.
- **TV de cocina (KDS):** pantalla de solo lectura que muestra las comandas en tiempo real conforme el mesero las envía.
- **Panel de administración:** CRUD de productos/categorías (con fotos), historial de órdenes, reportes simples de ventas, gestión de usuarios y mesas.
- **Menú QR estático:** página aparte, sin lógica de negocio, solo para que el cliente vea el menú desde su celular escaneando un QR en la mesa.

Cliente único, pago único por desarrollo + mantenimiento recurrente. Facturación fiscal la maneja el restaurante con otro sistema — **no es parte de este proyecto**.

---

## 2. Decisiones de arquitectura ya tomadas

| Decisión | Resolución |
|---|---|
| Hosting | **Local**, en una mini PC dentro del restaurante (no en la nube) |
| Sistema operativo | Debian o Ubuntu Server |
| Orquestación | Docker + Docker Compose |
| Comunicación en tiempo real | Socket.io (backend ↔ tablet ↔ TV cocina) |
| Base de datos | PostgreSQL (transacciones ACID, crítico para el correlativo y pagos) |
| Backend | Node.js + Express + Socket.io |
| Frontend tablet | React + Vite + Tailwind CSS |
| Frontend TV cocina | HTML + Alpine.js (ligero, solo lectura) |
| Panel admin | React + Vite (o Next.js si crece a muchas páginas) |
| Menú QR | Estático, HTML/CSS/JS puro, hosteado en GitHub Pages, repo separado |
| Acceso remoto para soporte | Tailscale |
| Respaldo eléctrico | UPS cubriendo mini PC + router |
| Backups | Script cron → almacenamiento externo (ej. Backblaze B2) |
| Repositorio | **Monorepo** con carpetas separadas por proyecto |

---

## 3. Estructura de carpetas (monorepo)

```
pos-restaurante/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── ordenes.js
│   │   │   ├── productos.js
│   │   │   ├── categorias.js
│   │   │   ├── mesas.js
│   │   │   ├── usuarios.js
│   │   │   ├── pagos.js
│   │   │   └── reportes.js
│   │   ├── sockets/
│   │   │   └── cocina.js
│   │   ├── db/
│   │   │   ├── connection.js
│   │   │   └── migrations/
│   │   ├── utils/
│   │   │   └── correlativo.js
│   │   ├── middleware/
│   │   │   └── auth.js
│   │   └── app.js
│   ├── uploads/                  (imágenes de productos)
│   ├── Dockerfile
│   └── package.json
│
├── tablet-app/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Mesas.jsx
│   │   │   ├── Orden.jsx
│   │   │   └── Cobro.jsx
│   │   ├── components/
│   │   ├── hooks/
│   │   │   └── useSocket.js
│   │   ├── db/
│   │   │   └── indexedDB.js
│   │   └── App.jsx
│   ├── vite.config.js
│   └── Dockerfile
│
├── kds-display/
│   ├── index.html
│   ├── app.js
│   └── style.css
│
├── admin-panel/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Productos.jsx
│   │   │   ├── Categorias.jsx
│   │   │   ├── Reportes.jsx
│   │   │   ├── Usuarios.jsx
│   │   │   └── Mesas.jsx
│   │   └── App.jsx
│   └── Dockerfile
│
├── shared/
│   └── types.js                  (formas de datos compartidas)
│
├── infra/
│   ├── docker-compose.yml
│   ├── nginx.conf
│   └── backup/
│       └── backup-postgres.sh
│
├── docs/
│   └── README.md
│
└── .gitignore
```

> El menú QR estático (`menu-restaurante/`) va en **repositorio separado**, no en este monorepo, porque se despliega en GitHub Pages de forma independiente.

---

## 4. Modelo de datos (PostgreSQL)

```sql
categorias (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR NOT NULL,
  imagen_url VARCHAR,
  orden INT DEFAULT 0
);

productos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR NOT NULL,
  descripcion TEXT,
  precio NUMERIC(10,2) NOT NULL,
  imagen_url VARCHAR,
  categoria_id INT REFERENCES categorias(id),
  activo BOOLEAN DEFAULT true
);

modificadores (
  id SERIAL PRIMARY KEY,
  producto_id INT REFERENCES productos(id),
  nombre VARCHAR NOT NULL,       -- "sin cebolla", "extra queso"
  precio_extra NUMERIC(10,2) DEFAULT 0
);

mesas (
  id SERIAL PRIMARY KEY,
  numero INT NOT NULL,
  estado VARCHAR DEFAULT 'libre'  -- libre, ocupada
);

usuarios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR NOT NULL,
  usuario VARCHAR UNIQUE NOT NULL,
  password_hash VARCHAR NOT NULL,
  rol VARCHAR NOT NULL            -- mesero, cocina, cajero, admin
);

ordenes (
  id SERIAL PRIMARY KEY,
  mesa_id INT REFERENCES mesas(id),
  usuario_id INT REFERENCES usuarios(id),
  correlativo INT,                -- NULL hasta que se cierra/paga
  fecha_correlativo DATE,
  estado VARCHAR DEFAULT 'abierta', -- abierta, pagada, cancelada
  fecha_apertura TIMESTAMP DEFAULT now(),
  fecha_cierre TIMESTAMP,
  total NUMERIC(10,2) DEFAULT 0
);

items_orden (
  id SERIAL PRIMARY KEY,
  orden_id INT REFERENCES ordenes(id),
  producto_id INT REFERENCES productos(id),
  cantidad INT NOT NULL,
  notas TEXT,
  precio_unitario NUMERIC(10,2) NOT NULL,
  estado VARCHAR DEFAULT 'pendiente', -- pendiente, preparando, listo, entregado
  enviado_cocina_at TIMESTAMP
);

pagos (
  id SERIAL PRIMARY KEY,
  orden_id INT REFERENCES ordenes(id),
  metodo VARCHAR NOT NULL,         -- efectivo, tarjeta
  monto NUMERIC(10,2) NOT NULL,
  creado_at TIMESTAMP DEFAULT now()
);

correlativos_dia (
  fecha DATE PRIMARY KEY,
  ultimo_numero INT DEFAULT 0
);
```

**Reglas de negocio clave a implementar en el backend:**

1. El **correlativo es diario y se asigna solo al cerrar/pagar** la orden, nunca al crearla:
   - Cada día reinicia el conteo desde 1 (no es un número global que sube para siempre).
   - `correlativos_dia` tiene `fecha` como llave primaria; cada fecha tiene su propio `ultimo_numero`, independiente de los demás días.
   - Al cerrar una orden: buscar (o crear si no existe) la fila de `correlativos_dia` para la fecha de HOY, incrementar `ultimo_numero` en una transacción con `SELECT ... FOR UPDATE`, y asignar ese número resultante a `ordenes.correlativo` junto con `ordenes.fecha_correlativo = hoy`.
   - Ejemplo esperado: el 3 de septiembre las órdenes cierran como correlativo 1, 2, 3... y el 4 de septiembre vuelve a arrancar en 1, 2, 3... aunque sean órdenes de mesas distintas o cajeros distintos cobrando al mismo tiempo.
   - Esto se hace con transacción y bloqueo (`FOR UPDATE`) precisamente para evitar que dos cobros simultáneos en la misma fecha se roben el mismo número.
2. Una orden puede recibir **múltiples envíos a cocina** (rondas). Cada envío marca solo los `items_orden` nuevos con `enviado_cocina_at`, para no reenviar lo ya cocinado.
3. Una orden puede tener **varios registros en `pagos`** (pago dividido). La orden pasa a `pagada` solo cuando la suma de `pagos.monto` iguala `ordenes.total`. Alcance inicial: dividir el **pago** (ej. mitad tarjeta, mitad efectivo), no dividir por item específico — eso queda como fase futura opcional.
4. Todas las operaciones de escritura relevantes (crear orden, agregar item, registrar pago, cerrar orden) deben ir en **transacciones** de Postgres para proteger contra cortes de luz a medio proceso.

---

## 5. Eventos de Socket.io

| Evento | Emisor | Receptor | Payload |
|---|---|---|---|
| `nueva_orden` | Backend | KDS | orden + items nuevos |
| `orden_actualizada` | Backend | KDS, Tablet | items agregados en nueva ronda |
| `item_estado_cambiado` | Backend | Tablet | item_id, nuevo estado (preparando/listo) |
| `orden_cerrada` | Backend | Tablet, KDS | orden_id |

---

## 6. Endpoints REST (backend)

```
GET    /api/categorias
GET    /api/productos
POST   /api/productos              (admin, con imagen)
PUT    /api/productos/:id
DELETE /api/productos/:id

GET    /api/mesas
POST   /api/mesas/:id/abrir

POST   /api/ordenes                       (crear orden en mesa)
GET    /api/ordenes/:id
POST   /api/ordenes/:id/items             (agregar items, ronda nueva)
POST   /api/ordenes/:id/enviar-cocina     (marca items como enviados, emite socket)
POST   /api/ordenes/:id/pagos             (registrar un pago; si suma completa el total, cierra y asigna correlativo)
GET    /api/ordenes/dia/:fecha            (historial con correlativo)

GET    /api/reportes/ventas-dia
GET    /api/reportes/productos-top

POST   /api/usuarios/login
GET    /api/usuarios                       (admin)
```

---

## 7. docker-compose.yml (referencia base)

```yaml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_DB: pos_db
      POSTGRES_USER: pos_user
      POSTGRES_PASSWORD: changeme
    volumes:
      - pgdata:/var/lib/postgresql/data

  backend:
    build: ./backend
    restart: unless-stopped
    depends_on:
      - postgres
    environment:
      DATABASE_URL: postgres://pos_user:changeme@postgres:5432/pos_db
    volumes:
      - uploads:/app/uploads
    ports:
      - "3000:3000"

  nginx:
    image: nginx
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./infra/nginx.conf:/etc/nginx/nginx.conf
      - ./tablet-app/dist:/usr/share/nginx/tablet
      - ./kds-display:/usr/share/nginx/kds
      - ./admin-panel/dist:/usr/share/nginx/admin

volumes:
  pgdata:
  uploads:
```

Rutas locales resultantes:
- Tablet: `http://<ip-local>/tablet`
- KDS: `http://<ip-local>/kds`
- Admin: `http://<ip-local>/admin`
- API: `http://<ip-local>/api`

---

## 8. UI de la tablet — layout objetivo

Usuario: **mesero**, no cliente final. Prioridad: velocidad, mínima navegación, todo en una pantalla para el flujo principal.

```
┌─────────────────────────────────────────────────┐
│  Mesa 5              [Cambiar mesa]   [Cobrar]    │
├──────────┬────────────────────────┬───────────────┤
│Categorías│   Grid de productos     │  Carrito/orden │
│(lateral) │   (foto + nombre +      │  actual        │
│          │    precio, táctil)      │  (siempre      │
│Entradas  │                         │   visible)     │
│Platos    │                         │                │
│Bebidas   │                         │  Total: L 450  │
│Postres   │                         │  [Enviar a     │
│          │                         │   cocina]      │
└──────────┴────────────────────────┴───────────────┘
```

- Fotos de producto: **WebP**, ~800x800px optimizadas, servidas como archivos estáticos (ruta guardada en `productos.imagen_url`, no como blob en la base de datos).
- Modificadores (sin cebolla, extra queso) como popup rápido de un toque.
- Botones grandes, pensados para dedo, no cursor.

---

## 9. Fases de desarrollo (orden sugerido)

**Fase 0 — Preparación**
- Crear repo, estructura de carpetas, diagrama de datos, entorno local (Node, Docker, Postgres).

**Fase 1 — Backend + base de datos**
- Migraciones de todas las tablas.
- CRUD de productos y categorías.
- CRUD de mesas.
- Crear orden / agregar items.
- Cerrar orden con lógica de correlativo transaccional.
- Eventos de Socket.io básicos.
- Probar todo con Postman/Thunder Client antes de tocar frontend.

**Fase 2 — Prototipo tablet → cocina**
- Tablet: seleccionar mesa, agregar productos (UI simple), enviar a cocina.
- KDS: recibir y mostrar órdenes en tiempo real vía Socket.io.
- Validar el flujo completo en red local real.

**Fase 3 — Flujo de cobro**
- Pantalla de cobro: total, método de pago, soporte de pago dividido (Opción C: dividir el monto, no items).
- Cierre de orden + generación de correlativo al completarse el pago.

**Fase 4 — Panel de administración**
- CRUD de productos con subida/optimización de imágenes (`multer` + `sharp`).
- Historial de órdenes del día con correlativo.
- Reporte simple de ventas y productos más vendidos.
- Gestión de usuarios y roles.

**Fase 5 — UI definitiva de la tablet**
- Aplicar el layout estilo kiosko (Sección 8) con Tailwind CSS.
- Grid de categorías/productos con fotos, carrito lateral siempre visible.
- Modificadores rápidos.

**Fase 6 — Resiliencia y producción**
- Dockerizar todos los servicios.
- IndexedDB en la tablet para cola offline (sincroniza cuando vuelve la wifi).
- `restart: unless-stopped` en todos los contenedores.
- Configurar auto-boot en BIOS de la mini PC.
- Login y roles (mesero, cocina, cajero, admin).
- Manejo de errores/validaciones (cobros simultáneos, etc.).

**Fase 7 — Despliegue**
- Configurar mini PC (Debian/Ubuntu + Docker + Tailscale + UPS).
- `docker compose up -d` en producción.
- Conectar tablets y TV a la wifi local apuntando a la IP de la mini PC.
- Prueba con el equipo real simulando un servicio completo.
- Capacitación a meseros/cocina.
- Configurar backup automático (cron → almacenamiento externo).

**Fase 8 — Proyecto aparte: menú QR estático**
- Repo separado, HTML/CSS/JS estático, sin backend.
- Navegación entre categorías con páginas separadas o tabs con JS simple.
- Deploy en GitHub Pages.
- Generar QR apuntando a la URL pública, para colocar en las mesas.

---

## 10. Fuera de alcance (explícitamente, para no meter scope creep)

- Facturación fiscal electrónica (el cliente ya factura con otro sistema).
- Pasarela de pago con tarjeta integrada en software (se asume datáfono físico aparte con SIM celular).
- División de cuenta por item específico (queda como posible fase futura, no en v1).
- Menú QR dinámico conectado a la API (v1 es 100% estático).

---

## 11. Notas para quien desarrolle (Codex u otro)

- Priorizar tener el flujo **tablet → cocina → cobro** funcionando de extremo a extremo con UI mínima antes de invertir tiempo en el diseño visual final o el panel admin.
- Todas las operaciones de dinero/correlativo deben ir en transacciones de Postgres — no calcular el correlativo contando filas de `ordenes`, usar la tabla `correlativos_dia` con bloqueo.
- Las imágenes de producto se guardan en disco (volumen Docker `uploads`), la base de datos solo guarda la ruta.
- Backend y frontends comparten formas de datos vía `shared/types.js` para evitar discrepancias de nombres de campos.
