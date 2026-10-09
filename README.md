# BACK · Preventa de indumentaria deportiva por club

Plataforma de la empresa (marca provisoria **BACK**, configurable desde el panel) con cuatro áreas:

1. **Web comercial** (`/`, `/propuesta`, `/nosotros`, `/contacto`, `/tu-club`): capta clubes, con simulador económico y solicitud de reunión.
2. **Panel compartido** (`/admin`): la empresa administra todo; el club consulta su información **en solo lectura** (campañas, ventas, pedidos, compradores y jugadores, pagos, saldo a cobrar, resultado estimado, producción, entrega y Excel).
3. **Tienda del socio** (`/club/<club>`): productos activos con cierre y cuenta regresiva, próximos atenuados ("Próximamente") y finalizados; configurador con frente, espalda y tabla de talles; carrito por jugador.
4. **Checkout y seguimiento**: el socio inicia sesión para pagar (el carrito se conserva), paga el **anticipo** por Mercado Pago y sigue su pedido en `/mi-cuenta`; el **saldo** se paga solo al club.

Anticipo (hipótesis pendiente de aprobación): A = B + (P − B) × deducciones (21 % + 3,5 %). **Sin la aprobación de la fórmula en el panel (Marca y fórmula) no se crean cobros reales**; el simulador sigue disponible.

- Análisis de los cambios BACK: [`docs/ANALISIS-BACK.md`](docs/ANALISIS-BACK.md)
- Requisitos y decisiones pendientes: [`docs/REQUISITOS.md`](docs/REQUISITOS.md)
- Diseño: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) · Verificación: [`docs/VERIFICACION.md`](docs/VERIFICACION.md)
- Muestra HTML autónoma de la tienda: [`docs/muestra/index.html`](docs/muestra/index.html)

## Estado

| Área | Estado |
|---|---|
| Clubes, deportes y categorías, fotos, usuarios por rol | Implementado |
| Prendas fabricables con talles y tabla de medidas; productos simples, conjuntos y combos | Implementado |
| Tienda por club, campañas vigentes e históricas, ventana con hora de Argentina | Implementado |
| Carrito por jugador, talle por componente, personalización por unidad, revisión explícita | Implementado |
| Seña y saldo con el mismo enlace privado; varios pagos por pedido | Implementado |
| Transferencias: comprobante, número de operación, revisión, rechazo con motivo, reemplazo | Implementado |
| Mercado Pago Checkout Pro + webhook firmado + consulta del pago | Implementado; **pendiente de credenciales** (probado contra un simulador local de la API) |
| Simulador de pagos para pruebas | **Simulado**, rotulado en tienda, pedido y panel; apagado por defecto |
| Cupos con reserva temporal y bloqueo por campaña | Implementado |
| Mínimo de producción con decisión administrativa explícita | Implementado |
| Lotes de producción versionados, ajustes, reporte sin datos personales (CSV/Excel) | Implementado |
| Entregas totales y parciales, QR de retiro, bloqueo por saldo con excepción y motivo | Implementado |
| Beneficio del club (registro interno) y liquidaciones | Implementado |
| Reporte comercial (CSV/Excel), enlace y QR de la tienda | Implementado |
| Recuperar el enlace privado del pedido por correo (respuesta neutra, con límite) | Implementado |
| Panel: cambio de contraseña propio y "olvidé mi contraseña" con enlace de un solo uso | Implementado (el enlace llega por correo: requiere SMTP) |
| Edición de talles, nombre, número y jugador por prenda mientras no esté en un lote aprobado | Implementado |
| Correos (8 avisos) | Plantillas y registro; **envío pendiente de SMTP** (sin SMTP se marcan "no enviado") |
| Anticipo textil por Mercado Pago + saldo al club registrado a mano; estados separados | Implementado |
| Solicitud de activación (club) y autorización (textil); precio textil / precio al socio / recargo; alcance por disciplina o categoría | Implementado |
| Reglas por producto: categoría completa y compra inicial, con aprobaciones explícitas | Implementado |
| Configurador guiado con opciones condicionales y reparto textil/club por adicional | Implementado |
| Acuerdos privados con alertas, muestrario de talles, compras del club | Implementado |
| Envío consolidado al club, remito, lista de distribución | Implementado |
| Planilla de gestión del club (servicio adicional, no afecta los datos del sistema) | Implementado |
| Piloto demostrativo "Virreyes Rugby Club (demo)" con bocetos reales de Walkersport | Implementado, precios de ejemplo |
| Marca configurable (nombre, logo, colores, contacto) y web comercial con simulador y solicitudes de reunión | Implementado |
| Club en solo lectura en servidor, APIs y panel; la empresa registra novedades y pagos externos | Implementado |
| Cuentas de socio: acceso antes de pagar, carrito conservado, asociación al club, número de socio opcional, "Mis pedidos" | Implementado |
| Fórmula del anticipo configurable (dos deducciones) con validaciones, redondeo y bloqueo de cobros reales sin aprobación | Implementado; **fórmula pendiente de aprobación comercial** |
| Excel de 5 hojas para la empresa y el club; compra adicional del club con revisión del lote y bloqueo por deuda | Implementado |
| Devoluciones vía API de Mercado Pago, facturación electrónica, integración con transportes | Pendiente (las devoluciones se registran manualmente) |

## Stack

Next.js 16.4 (App Router, standalone) · React 19.3 · TypeScript estricto · Tailwind CSS 4.3 · PostgreSQL 16 · Prisma 7.10 con `@prisma/adapter-pg` · zod 4 · sharp · exceljs · qrcode · nodemailer. Node 22.

```
src/
  app/          web comercial ((web)), tienda (/club), socios (/socios, /mi-cuenta), pedido (/pedido), panel (/admin) y API (/api)
  modules/      auth, audit, brand, leads, members, clubs, catalog, campaigns, orders, payments,
                purchases, production, deliveries, logistics, clubsheet, benefits, notifications, reports, storage
  shared/       db, env, dinero, fechas AR, cifrado, UI base
prisma/         schema, migraciones, seed de demostración
scripts/        verificación de punta a punta y simulador local de la API de Mercado Pago
```

## Desarrollo local

```bash
cp .env.example .env            # completar DATABASE_URL, APP_URL, APP_ENCRYPTION_KEY, CRON_SECRET, UPLOAD_DIR
npm ci
npx prisma migrate deploy
npm run db:seed                 # club de rugby ficticio + club de hockey (para probar aislamiento)
npm run dev
```

Usuarios de demostración (contraseña `camada-demo-2026`, cambiar con `SEED_PASSWORD`):

| Usuario | Rol |
|---|---|
| textil@camada.test | Empresa (administración total) |
| produccion@camada.test | Producción |
| club@nandues.test | Club Los Ñandúes (consulta) |
| entregas@nandues.test | Club Los Ñandúes (consulta) |
| club@sauce.test | Club El Sauce (consulta) |
| club@virreyes-demo.test | Club del piloto demo (consulta) |
| socio@demo.test | Socio (en `/socios/ingresar`) |

Tienda: `/club/los-nandues-rugby` · Campaña: `/club/los-nandues-rugby/coleccion-2026` · Piloto: `/club/demo-virreyes-rugby/verano-demo`. Para probar pagos online sin credenciales, `PAYMENT_SIMULATOR=enabled`.

## Despliegue en Coolify

1. **Recurso nuevo → Docker Compose** apuntando a este repositorio (rama `main`). El `docker-compose.yml` levanta la app y PostgreSQL 16 con volúmenes persistentes (`/data` para imágenes y comprobantes, y los datos de la base).
   - Si ya tenés una base PostgreSQL en Coolify, usá el build pack **Dockerfile**, montá un volumen persistente en `/data` y completá `DATABASE_URL`.
2. **Variables de entorno** (ver `.env.example`): `APP_URL` (dominio público con https), `APP_ENCRYPTION_KEY` (32 bytes base64, no cambiarla después), `CRON_SECRET`, `POSTGRES_PASSWORD`. Opcionales: `SMTP_URL`, `MAIL_FROM`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `SEED_DEMO=1` (solo el primer arranque, carga la demo si la base está vacía).
3. **Dominio**: asignalo al servicio `app`, puerto 3000. Healthcheck: `/api/health`.
4. **Tarea programada** (Scheduled Tasks del servicio `app`, cada 5 minutos):
   ```
   node -e "fetch('http://127.0.0.1:3000/api/cron/mantenimiento',{method:'POST',headers:{Authorization:'Bearer '+process.env.CRON_SECRET}}).then(r=>r.text()).then(console.log)"
   ```
   Vence reservas sin pago, cierra campañas por fecha, avisa vencimientos de acuerdos y envía correos pendientes.
5. Al iniciar, el contenedor aplica `prisma migrate deploy` y luego arranca `server.js`.
6. Respaldos: base de datos (backups de Coolify) y volumen `/data`.
7. Nombre, logo, colores y contacto de la marca se cargan en el panel (**Marca y fórmula**), no en variables de entorno. Ahí también se registra la aprobación de la fórmula del anticipo, requisito para cobrar con Mercado Pago real.

## Mercado Pago

1. En Mercado Pago → Tus integraciones, crear la aplicación (Checkout Pro).
2. En el panel: **Cuentas de cobro** → la cuenta de la textil o del club → pegar el Access Token y la clave secreta de webhooks. Se guardan cifradas (AES-256-GCM) y no se vuelven a mostrar.
3. En Mercado Pago → Webhooks, configurar la URL que muestra el panel para esa cuenta (`/api/webhooks/mercadopago/<id-de-cuenta>`), evento **Pagos**.
4. Probar primero con credenciales de prueba (`TEST-…`) antes de habilitar la campaña.

El pedido se confirma solo cuando llega una notificación con firma válida (`x-signature`) y la consulta a `GET /v1/payments/{id}` confirma estado, importe y moneda. Volver al sitio desde Mercado Pago no confirma nada. Notificaciones repetidas o desordenadas no duplican cobros. Un pago aprobado que llega tarde para un pedido sin cupo se registra igual y queda marcado para decisión administrativa.

## Verificación

```bash
npm run db:seed
MOCK_MP_TOKEN=TEST-0000000000000000000000-mock npm run mock:mp &
MP_API_BASE=http://127.0.0.1:4010 ORDER_RATE_LIMIT=1000 PAYMENT_SIMULATOR=enabled npm run dev &
MOCK_MP_TOKEN=TEST-0000000000000000000000-mock npm run verify
```

51 escenarios: web comercial y marca configurable, acceso por rol, club sin escritura (también llamando al servidor), socio con sesión y carrito conservado, productos activos/próximos/finalizados por hora del servidor, fórmula del anticipo con redondeo, pago pendiente frente a aprobado, bloqueo de cobros reales sin fórmula aprobada, personalización por unidad, Excel de 5 hojas sin duplicar cantidades, compra adicional del club separada con revisión del lote y bloqueo por deuda, confirmación y seguimiento de entrega, más los escenarios del modelo anterior (seña, transferencias, cupos concurrentes, lotes de ajuste, entregas, aislamiento entre clubes). Resultado en `docs/VERIFICACION.md`.

## Decisiones comerciales pendientes

Ver la sección 4 de [`docs/REQUISITOS.md`](docs/REQUISITOS.md) (transporte al club, reparto de adicionales, política de cambios de leyendas, mínimo de outfit, respaldo, conciliación, marca, datos del club piloto). Además: facturación electrónica y devoluciones del anticipo si se cancela una campaña.

## Notas técnicas

- `prisma generate` no necesita el motor de migraciones; el Dockerfile lo descarga en una etapa separada para `migrate deploy`.
- Prisma 7.10 ejecuta consultas en paralelo dentro de transacciones y `pg` 8.23 emite un aviso de deprecación (`client.query() when the client is already executing a query`). Es interno de Prisma y no afecta el resultado.
- El límite de pedidos por IP es en memoria (una instancia). Con varias réplicas, moverlo a Redis.
