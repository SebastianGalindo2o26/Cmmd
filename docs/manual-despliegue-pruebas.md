# Manual de despliegue y pruebas locales

Este manual sirve para instalar el POS en otra computadora y probarlo desde el
mismo equipo o desde una tablet y una pantalla conectadas a la misma red local.
También incluye el procedimiento de preparación de una mini PC Linux. El
HTTPS y la autenticación de tablet/KDS todavía requieren una iteración posterior.

## 1. Requisitos

En la computadora que ejecutará el sistema instala:

- Git.
- Docker Desktop con **Linux containers** y Docker Compose habilitado.
- Al menos 8 GB de RAM disponibles para Docker.
- Puerto TCP 80 libre.

Comprueba la instalación:

```powershell
git --version
docker --version
docker compose version
```

En Linux, instala Docker Engine y el complemento `docker compose`; los comandos
de Compose son los mismos, cambiando únicamente los comandos de copia de
archivos por sus equivalentes de la shell.

## 2. Descargar el repositorio

Abre PowerShell (Windows) o una terminal (Linux/macOS):

```powershell
git clone https://github.com/SebastianGalindo2o26/Cmmd.git
cd Cmmd
Copy-Item .env.example .env
```

En Linux/macOS:

```bash
git clone https://github.com/SebastianGalindo2o26/Cmmd.git
cd Cmmd
cp .env.example .env
```

Para una prueba local se puede conservar la contraseña de desarrollo. Antes de
un uso real, cambia `POSTGRES_PASSWORD` en `.env` y no publiques ese archivo.

El seed de desarrollo deja estas credenciales temporales:

- Usuario: `mesero_demo`
- Contraseña: `demo1234`

Solo sirven para probar el login. Cámbialas antes de una operación real.

## 3. Construir y levantar el sistema

Desde la raíz del repositorio:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml up -d --build
docker compose --env-file .env -f infra/docker-compose.yml ps
```

El primer build puede tardar porque descarga las imágenes base e instala las
dependencias. El estado esperado es:

- `postgres`: `healthy`.
- `backend`: `healthy`.
- `web`: `Up`.

Carga los datos de demostración una vez que el backend esté saludable:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml exec -T `
  -e NODE_ENV=development backend npm run seed:dev
```

El seed crea o reutiliza el usuario `mesero_demo`, ocho mesas, cuatro categorías
y siete productos. El usuario de desarrollo normalmente queda con ID `1`; usa
el ID que imprima el comando si la base ya tenía otros registros.

## 4. Probar en la computadora anfitriona

Abre estas direcciones:

| Función | Dirección |
|---|---|
| Tablet | `http://localhost/tablet/` |
| Cocina (KDS) | `http://localhost/kds/` |
| Administración | `http://localhost/admin/` |
| Salud de API | `http://localhost/api/health` |

La salud debe responder `{"estado":"ok"}`. También puedes comprobarlo en
PowerShell:

```powershell
Invoke-WebRequest http://localhost/api/health
```

## 5. Probar desde otra tablet o computadora en la misma red

1. Obtén la IPv4 de la computadora donde corre Docker:

   ```powershell
   ipconfig
   ```

   Busca la dirección IPv4 de la interfaz Wi-Fi o Ethernet, por ejemplo
   `192.168.1.25`.

2. En Windows, permite el puerto 80 únicamente en el perfil de red privada
   (ejecuta PowerShell como administrador):

   ```powershell
   New-NetFirewallRule -DisplayName "POS Restaurante HTTP" `
     -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -Profile Private
   ```

3. Desde el otro dispositivo abre, reemplazando la IP por la real:

   - `http://192.168.1.25/tablet/`
   - `http://192.168.1.25/kds/`
   - `http://192.168.1.25/admin/`

Ambos dispositivos deben estar en la misma red privada. Las redes de invitados
pueden bloquear la comunicación entre dispositivos (AP/client isolation).

## 6. Prueba funcional completa

### Tablet → cocina

1. Abre la tablet y confirma el **Usuario ID** que imprimió el seed.
2. Selecciona una mesa libre.
3. Elige una categoría y toca un producto.
4. Usa el popup para agregar una nota rápida, por ejemplo `Sin cebolla`, o una
   nota personalizada.
5. Pulsa **Agregar** y luego **Enviar a cocina**.
6. En el KDS debe aparecer la comanda sin recargar.
7. Avanza el producto por `Preparando`, `Listo` y `Entregado`.
8. La tablet debe mostrar los cambios de estado en tiempo real.

### Cobro

1. Agrega otra ronda si es necesario y envíala a cocina.
2. Pulsa **Cobrar** cuando no haya productos pendientes de enviar.
3. Registra primero un pago parcial, por ejemplo Q10.00 en efectivo.
4. Comprueba que el saldo se reduzca.
5. Registra el saldo restante con tarjeta o efectivo.
6. Debe aparecer el comprobante con correlativo, la mesa debe quedar libre y la
   orden debe desaparecer del KDS.

### Administración

1. Entra a `/admin/`.
2. En **Catálogo**, filtra categorías, edita un producto y carga una imagen.
3. Confirma que la imagen se muestre y que la ruta `/uploads/...` responda.
4. En **Órdenes**, selecciona la fecha del día y verifica el correlativo.
5. En **Reportes**, comprueba ventas, métodos de pago y productos principales.
6. En **Usuarios**, crea un usuario de prueba, cambia su rol y desactívalo.

## 7. Operación diaria durante la prueba

Ver logs del backend:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml logs -f backend
```

Recompilar después de traer cambios nuevos:

```powershell
git pull
docker compose --env-file .env -f infra/docker-compose.yml up -d --build
```

Detener los contenedores sin borrar la información:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml down
```

El volumen `pgdata` conserva órdenes, usuarios y catálogo; el volumen `uploads`
conserva las imágenes. Para reiniciar una base de pruebas desde cero, y solo si
no necesitas sus datos:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml down --volumes
```

## 8. Activar autenticación administrativa

Por defecto `AUTH_REQUIRED=false` facilita el desarrollo local. Para una prueba
protegida, configura en `.env`:

```dotenv
AUTH_REQUIRED=true
AUTH_SECRET=una-clave-aleatoria-de-al-menos-32-caracteres
```

Después reconstruye el backend:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml up -d --build backend web
```

Con esa opción, `/api/usuarios` exige un token de administrador y los reportes
exigen un usuario `cajero` o `admin`. El panel muestra el diálogo **Acceder**.
Las operaciones de tablet y KDS todavía deben recibir la autenticación de
operador en la siguiente iteración de endurecimiento; no uses esta opción como
seguridad completa de producción todavía.

## 9. Respaldo manual de PostgreSQL

El perfil `backup` crea un dump comprimido en formato propio de PostgreSQL y
conserva por defecto los últimos 14 días. Configura `BACKUP_DIR` en `.env` si
quieres guardarlo fuera del repositorio:

```powershell
docker compose --env-file .env -f infra/docker-compose.yml --profile backup run --rm backup
Get-ChildItem .\infra\backup\archives
```

Para restaurar una copia en una base de pruebas, detén el backend, crea una
base vacía y ejecuta `pg_restore` dentro de un contenedor PostgreSQL. No uses
`--clean` sobre una base con datos que quieras conservar.

En una mini PC Linux, copia el repositorio a `/opt/pos-restaurante`, instala la
unidad incluida y habilítala:

```bash
sudo cp infra/pos-restaurante.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pos-restaurante.service
sudo systemctl status pos-restaurante.service
```

La unidad cubre el arranque de Docker Compose; el autoencendido de la mini PC
en BIOS/UEFI y la cobertura de la UPS se configuran físicamente en el equipo.

## 10. Despliegue de fase 7 en mini PC Linux

La fase 7 se ejecuta sobre Debian 12 o Ubuntu Server LTS con una cuenta que
pueda usar Docker. En la mini PC:

1. Instala Docker Engine, el complemento Compose y Git.
2. Copia el repositorio a `/opt/pos-restaurante`.
3. Copia `.env.production.example` a `.env` y cambia la contraseña de
   PostgreSQL, `AUTH_SECRET` y la ruta `BACKUP_DIR`.
4. Conecta un disco o montaje externo en la ruta configurada para `BACKUP_DIR`.
5. Ejecuta el despliegue:

```bash
cd /opt/pos-restaurante
sudo sh infra/deploy-production.sh
```

El script construye las imágenes, ejecuta las migraciones incluidas en el
arranque del backend y comprueba `/api/health`. No ejecuta el seed de desarrollo.
Para verificar posteriormente:

```bash
sudo sh infra/check-production.sh
```

### Red local y Tailscale

Conecta la mini PC, las tablets y la pantalla de cocina a la misma red privada.
Obtén la IP con `ip addr` y prueba desde otro dispositivo:
`http://IP_DE_LA_MINI_PC/tablet/`, `/kds/` y `/admin/`. No expongas el puerto
80 directamente a Internet.

Para soporte remoto instala Tailscale en la mini PC y autorízala desde la
cuenta del restaurante:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale ip -4
```

Usa la IP de Tailscale solo para soporte administrativo. No publiques el panel
ni el puerto de PostgreSQL en una interfaz pública.

### Arranque, UPS y respaldo automático

Instala el arranque de Compose y el temporizador de backup:

```bash
sudo cp infra/pos-restaurante.service /etc/systemd/system/
sudo cp infra/backup/pos-restaurante-backup.service /etc/systemd/system/
sudo cp infra/backup/pos-restaurante-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pos-restaurante.service
sudo systemctl enable --now pos-restaurante-backup.timer
systemctl list-timers pos-restaurante-backup.timer
```

El backup diario ejecuta el perfil Compose `backup` a las 03:00, conserva la
retención configurada y escribe en `BACKUP_DIR`. La carpeta debe estar en un
disco externo o sincronizarse mediante el mecanismo de almacenamiento elegido;
una copia en el mismo disco de la mini PC no protege contra su fallo físico.

Configura en BIOS/UEFI `Restore on AC Power Loss` o su equivalente para que la
mini PC vuelva a encenderse después de un corte. La UPS debe alimentar la mini
PC, el router y, si aplica, la pantalla de cocina. Haz una prueba controlada y
verifica que el servicio vuelva a `healthy` antes de usar el sistema en horario
real.

### Prueba de servicio real y capacitación

Antes de entregar el sistema, ejecuta el flujo completo con el equipo:

- abrir mesa, enviar dos rondas y confirmar estados en KDS;
- registrar un pago parcial y cerrar con el saldo restante;
- revisar correlativo y reporte del día;
- desconectar brevemente una tablet, volver a conectarla y confirmar que la
  cola pendiente se sincroniza una sola vez;
- apagar y volver a encender la mini PC desde la UPS, verificando salud y datos;
- ejecutar un backup y comprobar que el archivo aparece en la ubicación externa.

Capacita a meseros en mesa, carrito, notas, envío y cobro; a cocina en los
estados de la comanda; y a administración en login, usuarios, reportes,
reinicio y comprobación de backups. Registra fecha, responsables y resultado
de cada prueba en el acta operativa del restaurante.

## 11. Problemas frecuentes

**El backend no aparece como `healthy`**

```powershell
docker compose --env-file .env -f infra/docker-compose.yml logs backend
docker compose --env-file .env -f infra/docker-compose.yml ps
```

Comprueba que PostgreSQL esté `healthy` y que `.env` tenga valores válidos.

**El puerto 80 ya está ocupado**

Detén IIS u otro servicio que use el puerto, o cambia temporalmente el mapeo en
`infra/docker-compose.yml` de `80:80` a `8080:80`. En ese caso utiliza
`http://localhost:8080/tablet/` y el mismo puerto desde la red local.

**Desde otro dispositivo no abre la página**

Confirma la IPv4 correcta, que la red esté marcada como privada y que el firewall
permita TCP 80. Verifica también que no sea una red Wi-Fi de invitados.

**No aparecen los cambios de código**

```powershell
docker compose --env-file .env -f infra/docker-compose.yml up -d --build
```

El navegador puede conservar assets; prueba una recarga forzada (`Ctrl+F5`).
