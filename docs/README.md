# POS Restaurante

Sistema de punto de venta local para restaurante. Actualmente incluye el
backend transaccional, la tablet del mesero, el KDS de cocina y el panel de
administración. El alcance
general, las fases y las reglas de negocio se encuentran en
[`plan-pos-restaurante.md`](../plan-pos-restaurante.md).

Este documento describe el estado real del repositorio: qué está implementado,
cómo funciona, por qué se construyó de esta manera, cómo ejecutarlo y qué falta.

## Estado actual

### Fase 0 — completada

| Entregable | Estado | Motivo |
|---|---|---|
| Repositorio Git | Listo | Las fases 0, 1, 2 y 3 tienen commits; los cambios de fase 4 quedan visibles por separado hasta su commit. |
| Monorepo | Listo | Backend, aplicaciones y archivos de infraestructura evolucionarán juntos y compartirán contratos. |
| Entorno Node.js | Listo | El backend usa Node.js 22 o superior y npm workspaces. |
| Docker y PostgreSQL | Listo | Reproduce el mismo entorno en desarrollo y en la futura mini PC del restaurante. |
| Estructura de carpetas | Lista | Cada aplicación tiene ubicación propia; tablet, cocina y administración se compilan desde el monorepo. |
| Diagrama de datos | Listo | Está en [`modelo-datos.md`](modelo-datos.md). |
| Variables de entorno | Listas | `.env.example` documenta la configuración sin guardar secretos reales en Git. |

### Fase 1 — completada

Ya está implementado:

- Conexión reutilizable a PostgreSQL mediante un pool.
- Sistema de migraciones SQL versionadas e idempotentes.
- Migración inicial de todas las tablas planeadas.
- CRUD REST de categorías.
- CRUD REST de productos.
- CRUD REST de mesas.
- Apertura transaccional de mesa y orden.
- Consulta individual e historial diario de órdenes cerradas.
- Agregar ítems usando el precio vigente del producto como precio histórico.
- Recálculo del total dentro de la misma transacción que agrega los ítems.
- Envío a cocina por rondas sin reenviar ítems anteriores.
- Transiciones controladas de estado: pendiente, preparando, listo y entregado.
- Pagos en efectivo o tarjeta, incluidos pagos divididos por monto.
- Rechazo de sobrepagos y de pagos sobre órdenes vacías o cerradas.
- Cierre automático cuando la suma pagada iguala el total.
- Correlativo diario asignado con bloqueo transaccional.
- Liberación de la mesa dentro de la misma transacción del cierre.
- Socket.io con salas separadas para cocina, tablet y administración.
- Eventos `nueva_orden`, `orden_actualizada`, `item_estado_cambiado`,
  `mesa_actualizada`, `pago_registrado` y `orden_cerrada`.
- Validación de cuerpos, parámetros y filtros.
- Transacciones para todas las escrituras implementadas.
- Respuestas HTTP y manejo centralizado de errores.
- Endpoint de salud de la API y la base de datos.
- Pruebas unitarias de las utilidades de validación.

Pendiente después de las fases implementadas:

- CRUD de modificadores.
- Autenticación, contraseñas con hash y autorización efectiva por rol.

La API de fase 1 cubre el flujo completo: catálogo → mesa → orden → rondas de
cocina → estados → uno o varios pagos → correlativo y cierre. El código de fase
2 conecta ahora los prototipos de tablet y cocina a ese flujo.

### Fase 2 — completada localmente

Ya se crearon los dos prototipos:

- Tablet React: mesas, categorías, productos, carrito, notas y envío de rondas.
- KDS Alpine.js: comandas activas, tiempo transcurrido y avance de estados.
- Reconexión e hidratación de estado desde la API.
- Nginx sirve `/tablet/` y `/kds/` en el puerto 80 y actúa como proxy de la API
  y Socket.io.
- Imagen Docker multi-stage para compilar ambos frontends.
- Seed de desarrollo con mesero, ocho mesas, cuatro categorías y siete productos.
- Dependencias instaladas y registradas en `package-lock.json`.
- Compilaciones de producción de tablet y KDS aprobadas.
- Compose completo construido y ejecutado con sus tres servicios.
- Flujo de API y eventos probado a través del proxy de Nginx.
- Renderizado real de ambas interfaces comprobado en Chrome, sin excepciones
  JavaScript.

La fase 2 está cerrada para el entorno local. Solo queda como validación de
instalación probarla desde dos dispositivos físicos en la red del restaurante;
esto no cambia el código del prototipo.

### Fase 3 — completada localmente

La tablet incorpora el flujo de caja previsto en el plan:

- Botón de cobro asociado a la orden y mesa seleccionadas.
- Resumen de productos, total, total pagado y saldo pendiente.
- Selección de efectivo o tarjeta; “tarjeta” registra el resultado del datáfono
  externo, no procesa una transacción bancaria.
- Pago completo o pagos divididos por monto y método.
- Historial de pagos parciales con hora, método e importe.
- Validación en centavos para no depender de aritmética de punto flotante.
- Bloqueo del cobro cuando hay productos locales o guardados aún no enviados a
  cocina, evitando cerrar una cuenta incompleta por accidente.
- Actualización entre tablets mediante `pago_registrado` cuando el pago todavía
  no completa el saldo.
- Comprobante final con total, fecha y correlativo diario.
- Cierre automático, liberación de mesa y retiro de la comanda del KDS.

El backend conserva la autoridad sobre el saldo, rechaza sobrepagos y ejecuta el
pago final, correlativo, cierre y liberación de mesa en una sola transacción.
Las validaciones de la interfaz mejoran la experiencia, pero no sustituyen esas
protecciones del servidor.

### Fase 4 - completada localmente

La administracion operativa ya esta disponible en `http://localhost/admin/`.
Incluye:

- CRUD de categorias y productos desde el navegador.
- Activacion/desactivacion de productos sin borrar el historial.
- Carga de imagenes por `multipart/form-data`; el backend las rota, limita a
  1200x1200, convierte a WebP (calidad 82) y las sirve desde `/uploads/`.
- Historial diario de ordenes con correlativo, mesa, mesero, total y estado.
- Reporte diario con ventas cobradas, metodos de pago y productos mas vendidos.
- CRUD de usuarios con roles `mesero`, `cocina`, `cajero` y `admin`.

El panel usa la misma API y el mismo proxy de Nginx que tablet y cocina. La
gestion de usuarios es administrativa, pero todavia no autentica sesiones ni
protege rutas por rol; autenticacion, contrasenas con hash y autorizacion quedan
para la fase de endurecimiento indicada en el plan.

### Fase 5 - completada localmente

La tablet ahora usa una interfaz tipo kiosco optimizada para operación táctil:

- Selector de mesa destacado antes de comenzar una orden y encabezado compacto
  con estado de conexión y acciones de cobro.
- Grid de productos con imágenes WebP, descripción, precio y objetivos táctiles
  grandes; la imagen se carga de forma diferida.
- Búsqueda rápida dentro de la categoría activa para localizar productos sin
  navegar entre pantallas.
- Carrito lateral siempre visible con líneas separadas, cantidades, notas y
  accesos de un toque para `Sin cebolla`, `Extra queso`, `Sin picante` y
  `Para llevar`.
- Popup de modificadores rápidos al agregar un producto; sus selecciones se
  envían como notas de cocina sin cambiar el precio del producto.
- Diseño responsive para tablet horizontal y pantallas estrechas, manteniendo
  el flujo existente de enviar a cocina y cobrar.

Los atajos de esta fase son notas operativas. Los modificadores con precio extra
y su CRUD de catálogo siguen reservados para una fase posterior.

## Arquitectura actual

```text
Tablet /tablet/ ──┐
KDS /kds/ ────────┼──► Nginx :80 ──► /api + /socket.io ──► Node.js :3000
                  │                                          │
                  └──────── archivos estáticos               ▼
                                                        PostgreSQL :5432
```

El Compose define tres servicios:

- `postgres`: almacena la información en el volumen persistente `pgdata`.
- `backend`: ejecuta primero las migraciones y después inicia Express y
  Socket.io sobre el mismo puerto.
- `web`: compila los tres frontends y usa Nginx para servirlos y dirigir las
  solicitudes `/api` y `/socket.io` al backend.

La ruta `/admin/` sirve el panel de administración y comparte el proxy `/api`
con tablet y cocina.

### Decisiones y razones

#### PostgreSQL en lugar de almacenamiento en memoria

Las órdenes, pagos y correlativos son datos críticos. PostgreSQL ofrece
transacciones, restricciones, bloqueos y persistencia ante reinicios. Esto será
especialmente importante cuando dos cajeros intenten cerrar órdenes al mismo
tiempo.

#### Migraciones SQL versionadas

El esquema no se crea manualmente. `npm run migrate` lee los archivos de
`backend/src/db/migrations` en orden y registra cada archivo aplicado en
`schema_migrations`.

Se usa un bloqueo asesor de PostgreSQL durante la migración. Así se evita que
dos instancias del backend intenten alterar el esquema simultáneamente al
arrancar.

#### Transacciones para escrituras

Crear, actualizar y eliminar registros pasa por `withTransaction`. Aunque los
CRUD actuales solo hacen una consulta cada uno, mantener esta regla desde el
inicio evita que operaciones futuras de varios pasos queden aplicadas a medias.

#### Validación en API y restricciones en base de datos

Zod rechaza solicitudes incorrectas antes de enviarlas a PostgreSQL. La base de
datos vuelve a validar reglas importantes mediante `CHECK`, claves únicas y
claves foráneas. Las dos capas cumplen objetivos distintos:

- La API entrega errores claros al cliente.
- PostgreSQL protege los datos aunque otra aplicación se conecte directamente.

#### Eliminación lógica de productos

`DELETE /api/productos/:id` cambia `activo` a `false`; no borra la fila. Una
orden histórica debe poder conservar la referencia al producto vendido aunque
ese producto deje de aparecer en el menú.

Las categorías sí se eliminan físicamente. Si una categoría todavía tiene
productos, su `categoria_id` pasa a `NULL` mediante `ON DELETE SET NULL`, sin
eliminar los productos.

#### Precios decimales

Los importes se guardan como `NUMERIC(10,2)`, no como números de punto flotante.
El controlador de PostgreSQL devuelve estos valores en JSON como texto, por
ejemplo `"15.75"`, para evitar pérdidas de precisión en JavaScript.

#### Fecha civil del restaurante

El correlativo usa `RESTAURANT_TIMEZONE`, cuyo valor predeterminado es
`America/Guatemala`. El tipo PostgreSQL `DATE` se conserva como texto
`YYYY-MM-DD` en Node.js; no se convierte a UTC porque esa conversión podría
cambiar accidentalmente el día civil del restaurante.

#### JavaScript con contratos JSDoc

`shared/types.js` define las formas compartidas actuales como JSDoc. Esto da
autocompletado sin introducir todavía una compilación TypeScript en todos los
proyectos. Puede migrarse a TypeScript si el sistema crece.

## Estructura del repositorio

```text
.
├── backend/
│   ├── src/
│   │   ├── db/
│   │   │   ├── migrations/       Esquema SQL versionado
│   │   │   ├── connection.js     Pool y helper de transacciones
│   │   │   └── migrate.js        Ejecutor de migraciones
│   │   ├── middleware/           Manejo centralizado de errores
│   │   ├── routes/               Categorías, productos y mesas
│   │   ├── services/             Apertura transaccional de órdenes
│   │   ├── sockets/              Registro de dispositivos y salas Socket.io
│   │   ├── utils/                Reservado para lógica compartida
│   │   ├── app.js                Configuración de Express
│   │   ├── config.js             Variables de entorno
│   │   └── server.js             Inicio y cierre controlado del servidor
│   ├── test/                     Pruebas unitarias
│   ├── uploads/                  Imágenes WebP optimizadas (persistencia local)
│   └── Dockerfile
├── tablet-app/                   Tablet React tipo kiosco para el mesero
├── kds-display/                  Prototipo Alpine.js para cocina
├── admin-panel/                  Panel React de administración
├── shared/types.js               Contratos de datos compartidos
├── infra/
│   ├── docker-compose.yml        PostgreSQL, backend y servidor web
│   ├── Dockerfile                Compilación multi-stage de frontends
│   ├── nginx.conf                Archivos estáticos, API y Socket.io
│   └── backup/                   Base del futuro respaldo de PostgreSQL
├── docs/
│   ├── README.md                 Este documento
│   └── modelo-datos.md           Diagrama entidad-relación
├── .env.example                  Variables de entorno de ejemplo
├── package.json                  Workspace y comandos raíz
└── plan-pos-restaurante.md       Plan funcional completo
```

El panel de administración, tablet y cocina se compilan juntos en la imagen web.
Los tres quedan publicados por Nginx en `/admin/`, `/tablet/` y `/kds/`.

## Modelo de datos implementado

La migración `001_initial_schema.sql` crea nueve tablas de negocio y una tabla
interna de migraciones.

| Tabla | Uso actual o futuro |
|---|---|
| `categorias` | Agrupa los productos y controla su orden visual. |
| `productos` | Catálogo, precios, imágenes y estado activo. |
| `modificadores` | Opciones futuras como “sin cebolla” o “extra queso”. |
| `mesas` | Número único y estado libre/ocupada. |
| `usuarios` | Personal y roles del sistema. |
| `ordenes` | Encabezado, mesa, usuario, total, estado y correlativo. |
| `items_orden` | Productos, cantidades, precio histórico y estado en cocina. |
| `pagos` | Uno o varios pagos asociados a una orden. |
| `correlativos_dia` | Último correlativo usado en cada fecha. |
| `schema_migrations` | Migraciones que ya fueron aplicadas. |

### Protecciones importantes del esquema

- El número de mesa es positivo y único.
- Una mesa solo puede tener una orden abierta, gracias al índice parcial
  `una_orden_abierta_por_mesa`.
- Un correlativo debe ser positivo y siempre debe tener fecha.
- La combinación de fecha y correlativo es única.
- Precios y totales no pueden ser negativos.
- Cantidades y pagos deben ser mayores que cero.
- Estados de mesa, orden e ítem solo aceptan valores conocidos.
- Los roles solo aceptan `mesero`, `cocina`, `cajero` o `admin`.
- Los métodos de pago actuales solo aceptan `efectivo` o `tarjeta`.
- Existen índices para las consultas futuras por categoría, orden y fecha.

Al completarse un pago, el backend obtiene la fecha civil del restaurante,
crea la fila de `correlativos_dia` si hace falta, la bloquea con
`SELECT ... FOR UPDATE`, incrementa el número y cierra la orden. El pago, el
correlativo, el cierre y la liberación de la mesa pertenecen a una sola
transacción: si una parte falla, ninguna queda aplicada.

## Requisitos

Para ejecutar todo con contenedores:

- Docker Desktop o Docker Engine.
- Docker Compose.

Para ejecutar el backend directamente:

- Node.js 22 o superior.
- npm.
- PostgreSQL accesible mediante `DATABASE_URL`.

Las versiones verificadas durante esta entrega fueron Node.js 24.14.0, npm
11.9.0, Docker 29.6.1 y Docker Compose 5.1.4. El contenedor utiliza Node.js 22
Alpine y PostgreSQL 16 Alpine para mantener imágenes pequeñas y versiones
estables.

## Configuración

Copiar el ejemplo antes de iniciar:

```powershell
Copy-Item .env.example .env
```

| Variable | Propósito | Ejemplo de desarrollo |
|---|---|---|
| `POSTGRES_DB` | Nombre de la base creada por el contenedor. | `pos_db` |
| `POSTGRES_USER` | Usuario de PostgreSQL. | `pos_user` |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL. | `change-this-password` |
| `DATABASE_URL` | Conexión usada por el backend fuera de Docker. | `postgres://pos_user:...@localhost:5432/pos_db` |
| `PORT` | Puerto HTTP del backend. | `3000` |
| `NODE_ENV` | Entorno de ejecución. | `development` |
| `RESTAURANT_TIMEZONE` | Zona usada para el correlativo diario. | `America/Guatemala` |

La contraseña de `.env.example` es únicamente un valor de desarrollo. Debe
cambiarse antes de instalar el sistema en el restaurante. `.env` está ignorado
por Git para evitar publicar credenciales.

## Ejecución con Docker

Instalar las dependencias la primera vez o cuando cambie el lockfile:

```powershell
npm install
```

Después, desde la raíz del repositorio:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml up --build
```

El arranque sigue este orden:

1. PostgreSQL crea o monta el volumen `pgdata`.
2. El healthcheck espera que PostgreSQL acepte conexiones.
3. El backend ejecuta `npm run migrate`.
4. El backend inicia en `0.0.0.0:3000`.
5. La imagen web compila tablet y KDS.
6. Nginx comienza a servir ambos prototipos en el puerto 80.

Para crear el usuario local usado durante el desarrollo de la interfaz:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml exec `
  -e NODE_ENV=development backend npm run seed:dev
```

El seed crea o reutiliza `mesero_demo`, además de ocho mesas, cuatro categorías
y siete productos de muestra. Imprime el `id` que la tablet debe usar como
`usuario_id`. No crea una contraseña utilizable porque la autenticación
pertenece a una fase posterior.

Direcciones locales:

- API: `http://localhost:3000/api`
- Salud: `http://localhost:3000/api/health`
- PostgreSQL: `localhost:5432`
- Tablet: `http://localhost/tablet/`
- Cocina: `http://localhost/kds/`

Para ejecutar en segundo plano:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml up --build -d
```

Para consultar estado y registros:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml ps
docker compose --env-file .env -f infra/docker-compose.yml logs -f backend
```

Para detener sin borrar la base de datos:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml down
```

Para eliminar también los datos locales se puede usar `down --volumes`. Ese
comando borra el volumen de PostgreSQL y no debe usarse sobre información que se
quiera conservar.

## Desarrollo local por aplicación

Con PostgreSQL en ejecución y `DATABASE_URL` configurada:

```powershell
npm install
npm run migrate
npm run dev
```

`npm run dev` usa el modo `--watch` de Node.js, por lo que reinicia el servidor
cuando cambia un archivo.

En otras terminales pueden iniciarse los prototipos:

```powershell
npm run dev:tablet
npm run dev:kds
```

Vite sirve la tablet en `http://localhost:5173/tablet/` y el KDS en
`http://localhost:5174/kds/`, enviando API y Socket.io al backend local.

Otros comandos disponibles:

| Comando | Acción |
|---|---|
| `npm run start` | Inicia el backend sin modo de observación. |
| `npm run dev:tablet` | Inicia la tablet con recarga automática. |
| `npm run dev:kds` | Inicia el KDS con recarga automática. |
| `npm run build:frontends` | Compila tablet y KDS para producción. |
| `npm run migrate` | Aplica migraciones pendientes. |
| `npm run seed:dev` | Crea datos completos para demostrar el flujo. |
| `npm test` | Ejecuta las pruebas del workspace backend. |
| `npm run test:integration` | Ejecuta el flujo real; requiere una base desechable y `ALLOW_INTEGRATION_DATA=true`. |

## API implementada

Todas las rutas reciben y devuelven JSON, salvo las eliminaciones exitosas de
categoría y mesa, que responden sin contenido.

### Salud

| Método | Ruta | Resultado |
|---|---|---|
| `GET` | `/api/health` | Comprueba que API y PostgreSQL responden. |

Respuesta:

```json
{
  "estado": "ok"
}
```

### Categorías

| Método | Ruta | Resultado |
|---|---|---|
| `GET` | `/api/categorias` | Lista por `orden` y luego por nombre. |
| `POST` | `/api/categorias` | Crea una categoría. |
| `PUT` | `/api/categorias/:id` | Reemplaza los campos editables. |
| `DELETE` | `/api/categorias/:id` | Elimina la categoría. |

Cuerpo para crear o actualizar:

```json
{
  "nombre": "Bebidas",
  "imagen_url": "/uploads/bebidas.webp",
  "orden": 1
}
```

`imagen_url` puede ser `null` y `orden` es opcional al crear. Los campos no
declarados son rechazados para detectar errores de escritura en los clientes.

### Productos

| Método | Ruta | Resultado |
|---|---|---|
| `GET` | `/api/productos` | Lista productos por nombre. |
| `GET` | `/api/productos/:id` | Consulta un producto. |
| `POST` | `/api/productos` | Crea un producto. |
| `POST` | `/api/productos/:id/imagen` | Recibe `imagen` y guarda una versión WebP optimizada. |
| `PUT` | `/api/productos/:id` | Reemplaza los campos editables. |
| `DELETE` | `/api/productos/:id` | Desactiva el producto. |

Cuerpo para crear o actualizar:

```json
{
  "nombre": "Café americano",
  "descripcion": "Taza de 12 onzas",
  "precio": 25.00,
  "imagen_url": "/uploads/cafe-americano.webp",
  "categoria_id": 1,
  "activo": true
}
```

Solo `nombre` y `precio` son obligatorios al crear. `categoria_id`,
`descripcion` e `imagen_url` pueden ser `null`. `activo` vale `true` por defecto.

Filtros disponibles:

```text
GET /api/productos?activo=true
GET /api/productos?categoria_id=1
GET /api/productos?categoria_id=1&activo=true
```

La respuesta incluye `categoria_nombre` en los listados y consultas individuales.
La carga acepta JPG, PNG, WebP o GIF de hasta 5 MB. La imagen se rota según sus
metadatos, se reduce sin ampliar y se convierte a WebP antes de guardarse en
`UPLOAD_DIR` (por defecto `backend/uploads`). La respuesta actualiza
`imagen_url` con una ruta `/uploads/...`.

### Administración, historial y reportes

| Método | Ruta | Resultado |
|---|---|---|
| `GET` | `/api/ordenes/dia/:fecha` | Historial de órdenes del día con correlativo. |
| `GET` | `/api/reportes/ventas-dia?fecha=YYYY-MM-DD&limite=10` | Resumen de ventas, pagos por método y productos top. |
| `GET` | `/api/reportes/productos-top?fecha=YYYY-MM-DD&limite=10` | Productos más vendidos del día. |
| `GET` | `/api/usuarios` | Lista personal y roles, sin contraseñas. |
| `POST` | `/api/usuarios` | Crea un usuario administrativo. |
| `PUT` | `/api/usuarios/:id` | Actualiza nombre, usuario, rol y estado. |
| `DELETE` | `/api/usuarios/:id` | Desactiva el usuario sin borrar su registro. |

El panel web consume estas rutas desde `/admin/`. Los usuarios de esta fase aún
no son credenciales de inicio de sesión: el campo de contraseña permanece
reservado hasta implementar autenticación y autorización por rol.

### Mesas

| Método | Ruta | Resultado |
|---|---|---|
| `GET` | `/api/mesas` | Lista las mesas por número. |
| `POST` | `/api/mesas` | Crea una mesa libre. |
| `POST` | `/api/mesas/:id/abrir` | Abre una orden y ocupa esa mesa. |
| `PUT` | `/api/mesas/:id` | Cambia su número. |
| `DELETE` | `/api/mesas/:id` | Elimina una mesa libre. |

Cuerpo para crear o actualizar:

```json
{
  "numero": 1
}
```

El número debe ser un entero positivo y no puede repetirse. Una mesa ocupada no
puede eliminarse. El estado no se acepta en este CRUD: cambiar de `libre` a
`ocupada` solo ocurre mediante el flujo transaccional de apertura de órdenes.

También existe `POST /api/mesas/:id/abrir`. Recibe `usuario_id` y crea la orden
mientras marca la mesa como ocupada. Es una alternativa equivalente a
`POST /api/ordenes` cuando el flujo de la interfaz comienza desde una mesa.

### Órdenes y cocina

| Método | Ruta | Resultado |
|---|---|---|
| `POST` | `/api/ordenes` | Abre una orden y ocupa la mesa. |
| `GET` | `/api/ordenes/:id` | Devuelve encabezado, ítems, pagos y saldo. |
| `GET` | `/api/ordenes/dia/:fecha` | Historial cerrado con fecha `YYYY-MM-DD`. |
| `GET` | `/api/ordenes/cocina/activas` | Comandas abiertas que ya tienen ítems enviados. |
| `POST` | `/api/ordenes/:id/items` | Agrega uno o varios ítems nuevos. |
| `POST` | `/api/ordenes/:id/enviar-cocina` | Envía solo los ítems aún no enviados. |
| `PATCH` | `/api/ordenes/:id/items/:itemId/estado` | Avanza el estado de un ítem. |
| `POST` | `/api/ordenes/:id/pagos` | Registra pago y cierra si completa el total. |

Abrir una orden:

```json
{
  "mesa_id": 1,
  "usuario_id": 1
}
```

Solo usuarios activos con rol `mesero`, `cajero` o `admin` pueden abrirla. La
API bloquea la fila de la mesa y rechaza una segunda orden si ya está ocupada.

Agregar ítems:

```json
{
  "items": [
    { "producto_id": 1, "cantidad": 2, "notas": "Sin cebolla" },
    { "producto_id": 2, "cantidad": 1, "notas": null }
  ]
}
```

La API no acepta un precio enviado por el cliente. Lee el precio vigente del
producto activo y lo copia a `items_orden.precio_unitario`; así una modificación
posterior del catálogo no cambia ventas históricas. Después recalcula el total
completo de la orden dentro de la misma transacción.

`enviar-cocina` asigna `enviado_cocina_at` únicamente a filas donde sigue en
`NULL`. El primer envío produce `nueva_orden`; los siguientes producen
`orden_actualizada`. Intentar enviar sin ítems nuevos responde `409`.

Los estados avanzan estrictamente así:

```text
pendiente → preparando → listo → entregado
```

No se permiten saltos ni retrocesos. El ítem debe haberse enviado antes a
cocina y la orden debe continuar abierta. Repetir el estado actual es
idempotente y no vuelve a emitir `item_estado_cambiado`.

### Pagos y cierre

Cuerpo del pago:

```json
{
  "metodo": "efectivo",
  "monto": "50.00"
}
```

El método puede ser `efectivo` o `tarjeta`. El monto puede llegar como número o
texto decimal, debe ser positivo y admite como máximo dos decimales.

- Si el pago es menor al saldo, la orden continúa abierta.
- Pueden registrarse varios pagos con métodos diferentes.
- Si el pago supera el saldo, toda la operación se rechaza.
- Si la suma alcanza exactamente el total, la orden se cierra automáticamente.
- Una orden pagada no admite más ítems, rondas, cambios ni pagos.

El último pago, la asignación del correlativo, el cierre y la liberación de mesa
son atómicos. Dos pagos concurrentes bloquean la misma orden; dos cierres de
órdenes diferentes bloquean el contador del día y reciben números diferentes.

### Pantalla de cobro de la tablet

Después de enviar todos los productos a cocina aparece **Cobrar** en la barra
superior. El diálogo toma el saldo desde la orden guardada, no desde el carrito
local. Al registrar un pago parcial permanece abierto, vuelve a consultar la
orden y muestra el nuevo saldo y el historial. El botón **Saldo completo** llena
el importe exacto y **Mitad** facilita un primer pago dividido.

Los importes aceptan punto o coma en la interfaz y se normalizan a dos decimales
antes de enviarse. La validación usa centavos enteros para comparar el monto con
el saldo sin introducir errores binarios de punto flotante. El backend vuelve a
validar el monto dentro de la transacción porque el saldo puede haber cambiado
por un cobro simultáneo.

Al completar el saldo se presenta un comprobante local con correlativo, fecha y
total. No es una factura fiscal ni un comprobante bancario; la facturación sigue
fuera del alcance y los pagos con tarjeta se realizan en un datáfono separado.

### Socket.io

Socket.io comparte `http://localhost:3000` con Express. Un cliente se registra
en una sala enviando el tipo en la conexión:

```javascript
const socket = io('http://localhost:3000', {
  query: { tipo: 'kds' }, // kds, tablet o admin
});
```

También puede emitir `registrar_dispositivo` con `{ tipo: 'tablet' }`. Al
conectarse recibe `conexion_lista`.

| Evento | Sala receptora | Momento |
|---|---|---|
| `mesa_actualizada` | `tablet` | Una mesa acaba de ocuparse. |
| `nueva_orden` | `kds` | Primera ronda enviada. |
| `orden_actualizada` | `kds`, `tablet` | Ronda posterior enviada. |
| `item_estado_cambiado` | `tablet` | Cocina avanza un ítem. |
| `pago_registrado` | `tablet` | Un pago parcial modifica lo pagado y el saldo. |
| `orden_cerrada` | `kds`, `tablet` | El pago completa el total. |

## Prototipos de fase 2

### Tablet del mesero

La aplicación React carga en paralelo mesas, categorías y productos activos.
El mesero puede abrir una mesa libre o reanudar la orden de una mesa ocupada.
Al tocar productos se forma una ronda local donde puede:

- Aumentar o reducir cantidades.
- Agregar una nota por producto.
- Ver el subtotal de la ronda.
- Guardar los ítems y enviarlos a cocina con una sola acción.
- Reintentar un envío pendiente sin volver a insertar los ítems.
- Ver estados actualizados mediante Socket.io.

El identificador del mesero se conserva en `localStorage`; esto es únicamente
una solución de desarrollo hasta que exista login. La interfaz usa controles
grandes y se adapta a tablet horizontal y pantallas más estrechas.

### KDS de cocina

La aplicación Alpine.js consulta `/api/ordenes/cocina/activas` al iniciar y al
reconectarse. Esto evita perder las comandas si la TV se recarga. Después recibe
las rondas nuevas mediante Socket.io.

Cada tarjeta muestra mesa, tiempo transcurrido, ítems, cantidades y notas. El
tiempo cambia de color a los 10 y 20 minutos. Cocina puede avanzar cada ítem y
la tarjeta permanece visible hasta que la orden sea pagada y llegue
`orden_cerrada`.

### Configuración opcional de Vite

Cada frontend incluye un `.env.example` con estas variables:

| Variable | Uso |
|---|---|
| `VITE_API_URL` | Base HTTP; por defecto `/api`. |
| `VITE_SOCKET_URL` | Servidor Socket.io; en Docker se usa el mismo origen. |
| `VITE_CURRENCY` | Moneda visual; por defecto `GTQ`. |
| `VITE_USUARIO_ID` | Usuario inicial de la tablet; por defecto `1`. |

Los valores `VITE_*` quedan incorporados durante la compilación y no deben
contener secretos.

## Respuestas y errores

| Código | Significado |
|---|---|
| `200` | Consulta, actualización o desactivación exitosa. |
| `201` | Registro creado. |
| `204` | Eliminación exitosa sin cuerpo. |
| `400` | ID, filtro o cuerpo inválido. |
| `404` | Ruta o registro inexistente. |
| `409` | Duplicado, referencia inválida o conflicto de estado. |
| `500` | Error no controlado del servidor. |

Ejemplo de validación fallida:

```json
{
  "error": "Datos inválidos",
  "detalles": {
    "fieldErrors": {
      "nombre": ["Too small: expected string to have >=1 characters"]
    }
  }
}
```

Los detalles concretos pueden variar entre versiones de Zod. El cliente debe
usar principalmente el código HTTP y el campo `error`.

## Ejemplos con PowerShell

Crear una categoría:

```powershell
$categoria = Invoke-RestMethod -Method Post `
  -Uri http://localhost:3000/api/categorias `
  -ContentType application/json `
  -Body '{"nombre":"Bebidas","orden":1}'
```

Crear un producto en esa categoría:

```powershell
$producto = @{
  nombre = 'Limonada'
  descripcion = 'Limonada natural'
  precio = 30.00
  categoria_id = $categoria.id
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri http://localhost:3000/api/productos `
  -ContentType application/json `
  -Body $producto
```

Crear una mesa:

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:3000/api/mesas `
  -ContentType application/json `
  -Body '{"numero":1}'
```

## Seguridad y límites actuales

- `helmet` agrega encabezados HTTP de seguridad básicos.
- Express oculta el encabezado `X-Powered-By`.
- El cuerpo JSON está limitado a 1 MB.
- CORS está abierto mientras se desarrollan clientes en distintos puertos.
- No existe autenticación ni autorización todavía.
- `usuario_id` y el tipo de sala Socket.io se confían durante el desarrollo;
  todavía no representan una frontera de seguridad.
- Los endpoints administrativos no deben exponerse fuera de una red de
  desarrollo hasta implementar usuarios y roles.
- No se deben utilizar las credenciales de ejemplo en producción.
- Nginx está construido y probado localmente; todavía debe limitarse su acceso
  antes de exponerlo fuera de la red autorizada.
- HTTPS y Tailscale todavía no están configurados.

Estas limitaciones son aceptables únicamente para la etapa actual de desarrollo
local. Antes del despliegue se cerrará CORS, se aplicarán roles y se configurará
el acceso por la red autorizada.

## Pruebas realizadas

La entrega actual fue verificada por última vez el 18 de septiembre de 2026 de
las siguientes maneras:

- Instalación y auditoría de las dependencias npm sin vulnerabilidades reportadas
  (`npm audit --omit=dev` y auditoría completa: 0 vulnerabilidades).
- Comprobación de sintaxis de todos los archivos JavaScript.
- Validación de `docker-compose.yml`.
- Seis pruebas unitarias aprobadas: tres del backend y tres de importes de cobro.
- Compilación de producción de tablet con 62 módulos, KDS con 34 y administración
  con 30 módulos.
- Construcción exitosa de las imágenes Docker `infra-backend` e `infra-web`.
- Inicio real y simultáneo de PostgreSQL, backend y Nginx.
- Aplicación de `001_initial_schema.sql`.
- Confirmación de diez tablas públicas: nueve de negocio y una de migraciones.
- Segunda ejecución de migraciones sin duplicar ni volver a aplicar el archivo.
- Seed idempotente comprobado con un mesero, ocho mesas, cuatro categorías y
  siete productos.
- Respuestas `200` comprobadas en `/tablet/`, `/kds/`, sus archivos JavaScript y
  CSS, y `/api/health`; `/` redirige a `/tablet/`.
- Tipos MIME comprobados: JavaScript se entrega como `application/javascript`
  y los estilos como `text/css`.
- Renderizado de tablet y KDS comprobado en Chrome mediante su protocolo de
  depuración: ambas cargaron datos, quedaron en línea y no emitieron excepciones
  JavaScript.
- Flujo integral con dos mesas, dos órdenes, dos rondas y pagos divididos.
- Recepción comprobada de los cinco eventos Socket.io del flujo integral,
  incluido `pago_registrado` para el pago parcial.
- Rechazo comprobado de mesa ocupada, ronda vacía y sobrepago.
- Dos cierres ejecutados en paralelo con correlativos diferentes.
- Confirmación de cierre, saldo cero, historial y liberación de ambas mesas.
- Repetición del flujo integral usando `http://localhost/api` y
  `http://localhost` para comprobar juntos los proxies HTTP y WebSocket de
  Nginx.
- Prueba de navegador de la fase 3 con una orden de Q52.00: pago de Q10.00 por
  tarjeta, saldo actualizado a Q42.00, pago final en efectivo, correlativo,
  mesa liberada y cero excepciones JavaScript.
- Validación de fase 4 por Nginx: `/admin/` respondió `200`, cargó categorías y
  siete productos en Chrome headless, y sus assets se sirvieron con MIME correcto.
- Subida real de imagen de producto: PNG convertido a WebP, servido con `200`
  desde `/uploads/`.
- Orden de prueba cobrada por Q38.00: historial diario, correlativo 1, resumen
  de ventas, método efectivo y producto top comprobados en los reportes.
- Validación de fase 5: build de tablet con la búsqueda, selector de mesa,
  imágenes diferidas y popup de notas rápidas incluidos en el bundle servido
  por Nginx; los tres frontends recompilaron correctamente con Compose.

La revisión visual detectó inicialmente que Nginx entregaba `.js` y `.css` como
`text/plain`. Se añadió el archivo oficial `mime.types` a `nginx.conf`, se
reconstruyó la imagen y la segunda revisión confirmó estilos, datos y JavaScript
funcionando. Esta comprobación importa porque una respuesta HTTP `200` por sí
sola no garantiza que el navegador acepte un módulo JavaScript.

Ejecutar nuevamente las pruebas unitarias:

```powershell
npm test
```

La prueba integral crea y elimina sus propios datos, por lo que debe apuntar a
la base local de desarrollo y exige la confirmación explícita siguiente:

```powershell
$env:DATABASE_URL='postgres://pos_user:change-this-password@localhost:5432/pos_db'
$env:ALLOW_INTEGRATION_DATA='true'
$env:RESTAURANT_TIMEZONE='America/Guatemala'
$env:API_URL='http://localhost/api'
$env:SOCKET_URL='http://localhost'
npm run test:integration
```

También puede importarse en Postman la colección
[`POS-Restaurante.postman_collection.json`](postman/POS-Restaurante.postman_collection.json).

Después de la verificación los contenedores fueron detenidos con `docker compose
down`. El volumen de PostgreSQL se conservó junto con el catálogo del seed. Los
datos temporales creados por las pruebas integral y visual se eliminaron al
finalizar; el contador del día de la prueba visual también se retiró al no tener
órdenes asociadas.

## Cómo repetir la prueba de las fases 2, 3 y 4

Este procedimiento sirve para repetir la validación en otro momento desde la
raíz del repositorio.

1. Preparar el entorno e instalar exactamente las dependencias registradas:

   ```powershell
   Copy-Item .env.example .env
   npm ci
   npm run build:frontends
   ```

2. Construir e iniciar PostgreSQL, backend y servidor web:

   ```powershell
   docker compose --env-file .env -f infra/docker-compose.yml up -d --build
   docker compose --env-file .env -f infra/docker-compose.yml ps
   ```

   `postgres` y `backend` deben aparecer como `healthy`; `web` debe aparecer
   como `Up` y publicar el puerto 80.

3. Cargar o actualizar los datos de demostración:

   ```powershell
   docker compose --env-file .env -f infra/docker-compose.yml exec -T `
     -e NODE_ENV=development backend npm run seed:dev
   ```

4. Abrir simultáneamente:

   - Tablet: `http://localhost/tablet/`
   - Cocina: `http://localhost/kds/`
   - Administracion: `http://localhost/admin/`
   - Salud técnica: `http://localhost/api/health`

   En tablet, abrir una mesa, agregar uno o varios productos y usar **Enviar a
   cocina**. La comanda debe aparecer sin recargar en el KDS. Al avanzar un ítem
   en cocina, su nuevo estado debe aparecer en tablet. Después seleccionar
   **Cobrar**, registrar primero un monto menor al saldo con un método y completar
   el resto con el otro. Deben mostrarse el historial, saldo cero, correlativo y
   mesa liberada.

   En administracion, comprobar el catalogo, crear o editar un producto,
   cargar una imagen, revisar **Ordenes** y consultar **Reportes** y **Usuarios**.

5. Ejecutar la validación automatizada completa por Nginx:

   ```powershell
   npm test
   $env:DATABASE_URL='postgres://pos_user:change-this-password@localhost:5432/pos_db'
   $env:ALLOW_INTEGRATION_DATA='true'
   $env:RESTAURANT_TIMEZONE='America/Guatemala'
   $env:API_URL='http://localhost/api'
   $env:SOCKET_URL='http://localhost'
   npm run test:integration
   ```

6. Al terminar, detener los servicios sin borrar la información:

   ```powershell
   docker compose --env-file .env -f infra/docker-compose.yml down
   ```

   Agregar `--volumes` borra la base local y solo debe hacerse cuando se quiera
   comenzar desde cero.

Para probar desde dos dispositivos físicos, se reemplaza `localhost` por la IP
local de la computadora que ejecuta Docker y se permite el puerto 80 únicamente
en la red privada. Tailscale, HTTPS y el endurecimiento de acceso se abordarán
en la etapa de despliegue.

## Siguiente fase

La fase 6 corresponde a resiliencia y producción: cola offline con IndexedDB,
reinicio automático, autoarranque, autenticación y roles, manejo de errores
concurrentes y preparación de la mini PC. El despliegue de red, Tailscale,
respaldos y operación real pertenece a la fase 7.
