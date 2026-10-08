# Walkersport · Preventa de indumentaria para clubes

Plataforma para una textil que ofrece a cada club su tienda de preventa: socios y familias configuran prendas, talles, jugadores y personalización; pagan el **anticipo** (precio textil + cobertura impositiva sobre la diferencia del club) con Mercado Pago a la textil; la textil consolida los pedidos y entrega toda la producción en el club; desde ahí el club cobra su **saldo** y entrega a cada socio, con una planilla de gestión propia opcional que no modifica los datos del sistema.

Las reglas comerciales vigentes, los supuestos y lo pendiente están en [`docs/REQUISITOS.md`](docs/REQUISITOS.md). Las campañas creadas antes del 08/10/2026 conservan el modelo anterior de seña.

- Diseño previo: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md)
- Verificación de punta a punta: [`docs/VERIFICACION.md`](docs/VERIFICACION.md)
- Landing de muestra (HTML autónomo): [`docs/muestra/index.html`](docs/muestra/index.html)

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
| Piloto demostrativo "Rugby de Virreyes (demo)" | Implementado, con datos de ejemplo |
| Devoluciones vía API de Mercado Pago, facturación electrónica, integración con transportes | Pendiente (las devoluciones se registran manualmente) |

## Stack

Next.js 16.4 (App Router, standalone) · React 19.3 · TypeScript estricto · Tailwind CSS 4.3 · PostgreSQL 16 · Prisma 7.10 con `@prisma/adapter-pg` · zod 4 · sharp · exceljs · qrcode · nodemailer. Node 22.

```
src/
  app/          rutas públicas (/club, /pedido), panel (/admin) y API (/api)
  modules/      auth, audit, clubs, catalog, campaigns, orders, payments, production,
                deliveries, benefits, notifications, reports, storage
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
| textil@camada.test | Administración textil |
| produccion@camada.test | Producción |
| club@nandues.test | Administración del club Los Ñandúes |
| entregas@nandues.test | Entregas Los Ñandúes |
| club@sauce.test | Administración del club El Sauce |
| club@virreyes-demo.test | Administración del club del piloto demo |

Tienda: `/club/los-nandues-rugby` · Campaña: `/club/los-nandues-rugby/coleccion-2026` · Piloto: `/club/demo-virreyes-rugby/verano-demo`. Para probar pagos online sin credenciales, `PAYMENT_SIMULATOR=enabled`.

## Despliegue en Coolify

1. **Recurso nuevo → Docker Compose** apuntando a este repositorio (rama `main`). El `docker-compose.yml` levanta la app y PostgreSQL 16 con volúmenes persistentes (`/data` para imágenes y comprobantes, y los datos de la base).
   - Si ya tenés una base PostgreSQL en Coolify, usá el build pack **Dockerfile**, montá un volumen persistente en `/data` y completá `DATABASE_URL`.
2. **Variables de entorno** (ver `.env.example`): `APP_URL` (dominio público con https), `APP_ENCRYPTION_KEY` (32 bytes base64, no cambiarla después), `CRON_SECRET`, `POSTGRES_PASSWORD`. Opcionales: `TEXTIL_BRAND` (marca para la línea "Club by Marca"), `SMTP_URL`, `MAIL_FROM`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `SEED_DEMO=1` (solo el primer arranque, carga la demo si la base está vacía).
3. **Dominio**: asignalo al servicio `app`, puerto 3000. Healthcheck: `/api/health`.
4. **Tarea programada** (Scheduled Tasks del servicio `app`, cada 5 minutos):
   ```
   node -e "fetch('http://127.0.0.1:3000/api/cron/mantenimiento',{method:'POST',headers:{Authorization:'Bearer '+process.env.CRON_SECRET}}).then(r=>r.text()).then(console.log)"
   ```
   Vence reservas sin pago, cierra campañas por fecha, avisa vencimientos de acuerdos y envía correos pendientes.
5. Al iniciar, el contenedor aplica `prisma migrate deploy` y luego arranca `server.js`.
6. Respaldos: base de datos (backups de Coolify) y volumen `/data`.

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

45 escenarios. Modelo v2: textil $10.000 / final $13.000 → anticipo $10.720 / saldo $2.280, fórmula de adicionales con recargo, varios ítems con adicionales, anticipo aprobado con saldo pendiente, final = textil, categoría completa de 11 con aprobación excepcional, compra inicial de 15 editable, personalización condicional por unidad, consolidación de prendas base y trabajos de personalización, envío consolidado y recepción en el club, saldo al club y retiro, conciliación de Mercado Pago, conservación de pedidos anteriores, acuerdos y páginas por rol. Modelo anterior: varios jugadores y talles, conjuntos con talles independientes, personalización por unidad, seña y saldo, comprobantes rechazados y reemplazados, eventos de pago duplicados y concurrentes, rechazo y reintento, firma inválida, reembolso, cierre de campaña, mínimo no alcanzado, consolidación sin duplicar componentes, lotes de ajuste, entregas parcial y con excepción, aislamiento entre clubes y roles, cupos concurrentes (40 compras simultáneas, cupo 25), edición de prendas antes y después de fabricar, recuperación del enlace del pedido y gestión de contraseñas. Resultado en `docs/VERIFICACION.md`.

## Decisiones comerciales pendientes

Ver la sección 4 de [`docs/REQUISITOS.md`](docs/REQUISITOS.md) (transporte al club, reparto de adicionales, política de cambios de leyendas, mínimo de outfit, respaldo, conciliación, marca, datos del club piloto). Además: facturación electrónica y devoluciones del anticipo si se cancela una campaña.

## Notas técnicas

- `prisma generate` no necesita el motor de migraciones; el Dockerfile lo descarga en una etapa separada para `migrate deploy`.
- Prisma 7.10 ejecuta consultas en paralelo dentro de transacciones y `pg` 8.23 emite un aviso de deprecación (`client.query() when the client is already executing a query`). Es interno de Prisma y no afecta el resultado.
- El límite de pedidos por IP es en memoria (una instancia). Con varias réplicas, moverlo a Redis.
