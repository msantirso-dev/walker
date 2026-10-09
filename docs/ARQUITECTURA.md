# Walkersport — Plataforma de preventa de indumentaria para clubes

Documento de diseño previo a la implementación. Describe arquitectura, modelo de datos, pantallas, flujos y supuestos comerciales. Todo lo marcado como **[Definir]** requiere una decisión comercial antes de operar con dinero real.

---

## 1. Arquitectura

### 1.1 Stack (versiones verificadas el 07/10/2026)

| Pieza | Versión | Motivo |
|---|---|---|
| Node.js | 22 LTS | Requerido por Next 16 (≥ 20.9) y Prisma 7 (≥ 20.19). |
| Next.js (App Router, `output: standalone`) | 16.4 | Front y back en un único servicio. Server Actions para el panel, Route Handlers para webhooks, cargas y exportaciones. |
| React | 19.3 | El que exige Next 16. |
| TypeScript estricto | 5.x | |
| Tailwind CSS | 4.3 | Tokens como CSS custom properties; los colores del club se inyectan por variables. |
| PostgreSQL | 16 | Transacciones y `SELECT … FOR UPDATE` para cupos concurrentes. |
| Prisma ORM + `@prisma/adapter-pg` | 7.10 (estable) | La etiqueta `latest` de npm apunta a una 8.0 RC; se fija 7.10. Prisma 7 usa driver adapter y `prisma.config.ts`. |
| zod | 4 | Validación de todas las entradas y del entorno. |
| sharp | — | Revalida y recodifica imágenes subidas (elimina metadatos, limita dimensiones). |
| exceljs / qrcode / bcryptjs / nodemailer | — | Exportación XLSX, QR, hash de contraseñas, SMTP opcional. |

Mercado Pago se integra por **REST directo** (sin SDK) detrás de una interfaz `PaymentProvider`, según la documentación oficial vigente: Checkout Pro (`POST /checkout/preferences` → `init_point`), confirmación por webhook con firma `x-signature` (HMAC-SHA256 sobre `id:[data.id];request-id:[x-request-id];ts:[ts];`) y consulta `GET /v1/payments/{id}`. Se responde 200 dentro del plazo de 22 s que fija Mercado Pago; los reintentos del proveedor se procesan de forma idempotente.

### 1.2 Estructura

```
src/
  app/                    rutas (públicas, /admin, /api)
  modules/                cada módulo expone su superficie por index.ts
    auth/                 sesiones, contraseñas, permisos por rol y club
    clubs/                club, deportes, categorías, fotos
    catalog/              prendas (fabricables), talles y medidas, productos y componentes
    campaigns/            campañas, ventanas, estados, decisión de mínimo
    orders/               carrito → pedido, precios en servidor, reservas de cupo
    payments/             registro de pagos, transferencias, Mercado Pago, simulador, webhooks
    production/           lotes, versiones, ajustes, reporte de fabricación
    deliveries/           entregas totales/parciales, código de retiro, excepciones
    benefits/             regla de beneficio del club y liquidaciones
    notifications/        correos (bandeja de salida + SMTP opcional)
    reports/              exportaciones CSV/XLSX
    audit/                historial de operaciones
    storage/              archivos en volumen persistente
  shared/                 db, env, dinero, fechas AR, cifrado, UI base (no importa módulos)
```

### 1.3 Despliegue

- Un contenedor (Docker multi-stage `deps → builder → runner`, Next standalone) + PostgreSQL gestionado por Coolify.
- Volumen persistente `/data` con `uploads/public` (imágenes de catálogo) y `uploads/private` (comprobantes; nunca servidos sin autorización).
- `prisma migrate deploy` al iniciar; `prisma generate` en build. Sin acceso a red en build (fuentes por `@fontsource`).
- `/api/health` para el healthcheck de Coolify.
- Tarea programada (cron de Coolify) a `/api/cron/mantenimiento` con secreto: vence reservas y cierra campañas por fecha.

### 1.4 Seguridad

- Contraseñas con bcrypt; sesión en cookie `httpOnly`, `SameSite=Lax`, `Secure` en producción; en base solo se guarda el hash del token.
- Permisos **siempre en el servidor**: cada consulta del panel pasa por `scopeFor(user)` que fija `clubId`. El operador de producción no recibe datos personales.
- Enlace privado del pedido: token aleatorio de 256 bits; en base se guarda su hash SHA-256. El código visible del pedido (`K7Q-4MZ2`) es aleatorio, no correlativo, y no da acceso.
- Credenciales de Mercado Pago por cuenta de cobro cifradas con AES-256-GCM (`APP_ENCRYPTION_KEY`); el navegador nunca las recibe.
- Cargas: imágenes JPG/PNG/WebP ≤ 5 MB revalidadas con sharp; comprobantes JPG/PNG/WebP/PDF ≤ 8 MB verificados por firma binaria; nombres aleatorios; límite de cargas por pedido.
- Precios, señas, envío y beneficio se calculan solo en el servidor; los importes del navegador se ignoran.
- Historial (`AuditLog`) de: ingresos, cambios de precios y condiciones, credenciales, revisiones de pago, devoluciones, aprobaciones de lote, entregas y excepciones.

---

## 2. Modelo de datos

```
Club ─┬─ ClubSport ── Sport
      ├─ Category (deporte, división)
      ├─ ClubPhoto
      ├─ User (rol + club)                 TEXTIL_ADMIN | CLUB_ADMIN | PRODUCTION | DELIVERY
      ├─ PaymentAccount (dueño: textil o club; datos bancarios; credenciales MP cifradas)
      ├─ Garment (prenda fabricable: código, variante, material, cuidado)
      │    └─ GarmentSize (talle, grupo, orden, ancho de pecho, largo, unidad)
      ├─ Product (lo que se vende: simple, conjunto o combo; estado de catálogo, familia, técnica)
      │    ├─ ProductOptionGroup ─ ProductOptionValue (configurador: elección/texto/número, dependencias, precio textil y club)
      │    ├─ ProductComponent → Garment     (un producto simple tiene 1 componente)
      │    └─ ProductImage (vista + etiqueta REAL | DISEÑO | REFERENCIA)
      ├─ ClubAgreement (acuerdo privado: exclusividad, fechas, línea de marca, contrato adjunto, alertas)
      ├─ SizeSampleSet (curva del muestrario) ─ SizeSampleItem; ProductSampleLink (equivalencia aprobada)
      ├─ ClubPurchase (muestrario | compra inicial | respaldo) ─ ClubPurchaseItem (talles)
      └─ Campaign (modelo de precios, alcance, solicitud/autorización, ventana, mínimo, cupo, políticas, cuenta de cobro)
           ├─ CampaignProduct (precio textil, precio al socio o recargo, cupo, regla de producción)
           ├─ ClubShipment (envío consolidado al club; agrupa lotes)
           ├─ BenefitRule (fijo por prenda | % sobre precio de prendas)
           ├─ BenefitSettlement (liquidaciones registradas)
           ├─ Order ─┬─ Buyer (por club, por email)
           │         ├─ Player (nombre, deporte, categoría, equipo)
           │         ├─ OrderUnit (1 fila = 1 producto vendido; snapshot de precio al socio y textil, jugador, opciones, sin cambio de talle)
           │         │    ├─ OrderUnitComponent (prenda, código, variante, talle elegido)
           │         │    └─ OrderUnitOption (grupo, valor, precio textil y club al momento de comprar)
           │         ├─ Payment (anticipo | saldo al club | seña | saldo | total | devolución; quién cobra; conciliación MP)
           │         │    └─ Receipt (comprobante; historial de reemplazos)
           │         └─ Delivery (quién retiró, cuándo, unidades, excepción con motivo)
           └─ ProductionLot (versión, estado, snapshot congelado al aprobar; principal o ajuste)
                └─ ProductionLotUnit (unidad incluida, delta +1 / −1)
WebhookEvent · EmailOutbox · AuditLog · Session · SimulatedPayment
```

Decisiones clave:

- **Prenda ≠ producto.** La prenda es lo que se fabrica (código `CAM-TIT-26`); el producto es lo que se vende. Un combo "Camiseta + short" referencia dos prendas; la camiseta vendida sola y la del combo suman en la misma línea de fabricación, sin duplicar.
- **Una fila por unidad** (`OrderUnit`). Permite jugador, nombre y número distintos en dos camisetas del mismo talle, entrega parcial por unidad y trazabilidad en el lote.
- **Snapshot en el pedido:** precio, descripción, código, talle, reglas de seña, políticas aceptadas (texto + hash) y regla de beneficio vigente. Editar el catálogo no altera pedidos.
- **Estados separados** en el pedido: `orderStatus` (pendiente de seña, confirmado, cancelado, vencido), pago (derivado del registro de pagos), fabricación (derivada del lote) y entrega (no lista, lista, parcial, entregado).
- **Importes en centavos** (enteros). Nunca flotantes.

### 2.1 Estados

- Campaña: `BORRADOR → ACTIVACIÓN_SOLICITADA → ACTIVACIÓN_APROBADA → PUBLICADA → CERRADA → EN_PRODUCCIÓN → LISTA_PARA_RETIRO → FINALIZADA`, o `CANCELADA` (las del modelo anterior pasan de borrador a publicada). La compra solo se habilita si está publicada y dentro de la ventana (hora de Argentina).
- Producto en catálogo: `PREPARACIÓN | CATÁLOGO_SIN_VENTA | PREVENTA_ACTIVA | PREVENTA_CERRADA | ARCHIVADO`.
- Envío al club: `EN_PREPARACIÓN → DESPACHADO → RECIBIDO` (al recibirlo, sus lotes pasan a "recibido por el club").
- Pago: `CREADO → PENDIENTE | EN_REVISIÓN → APROBADO | RECHAZADO | CANCELADO | VENCIDO | DEVUELTO`.
- Lote: `PENDIENTE_APROBACIÓN → APROBADO → EN_PRODUCCIÓN → CONTROL_CALIDAD → LISTO_DESPACHO → RECIBIDO_POR_CLUB`.

### 2.2 Importes visibles

Por pedido se muestran por separado: **total**, **confirmado** (pagos aprobados − devoluciones), **en revisión** (comprobantes sin revisar) y **saldo adeudado** (total − confirmado). Un comprobante en revisión nunca reduce el saldo.

En el modelo v2 (`pricingModel = TEXTIL_ADVANCE`) además: **anticipo** requerido y acreditado (lo cobra la textil por Mercado Pago) y **saldo al club** requerido y registrado (lo cobra el club fuera de la plataforma). El pedido se confirma con el anticipo; nunca figura "pagado" con saldo al club pendiente.

---

## 3. Mapa de pantallas

**Públicas**
- `/` — presentación de la textil y tiendas activas.
- `/club/[club]` — tienda del club: identidad, campaña vigente, cómo funciona, colección, campañas anteriores, condiciones, horarios, FAQ y contacto.
- `/club/[club]/[campaña]` — colección, ficha de producto (fotos etiquetadas, talles por componente, tabla de medidas, personalización), carrito con jugadores, datos del comprador, revisión explícita y pago.
- `/pedido/[token]` — seguimiento privado: prendas por jugador, pagos y comprobantes, saldo, avance de fabricación publicado, retiro, QR de retiro, WhatsApp.
- `/pago-simulado/[id]` — solo con simulador habilitado; rotulado como **SIMULACIÓN**.

**Panel** (`/admin`, contenido según rol)
- Inicio con métricas y alertas (correo sin configurar, pagos simulados, pagos en revisión).
- Clubes → identidad, fotos, deportes y categorías, usuarios, cuentas de cobro.
- Prendas (talles y medidas) y Productos (componentes, fotos, personalización).
- Campañas → configuración, colección y precios, publicación, enlace y QR, decisión de mínimo, beneficio.
- Pedidos → búsqueda, filtros, detalle, pagos, cancelaciones, devoluciones, historial, exportación.
- Revisión de pagos (cola de comprobantes).
- Producción → lotes, versiones, ajustes, estados, exportación CSV/XLSX.
- Entregas → búsqueda por código o QR, entrega total o parcial, excepción por saldo.
- Correos (bandeja de salida) y Usuarios.

---

## 4. Flujos

### 4.1 Comprador
1. Entra a la tienda del club por enlace o QR.
2. Agrega productos: elige talle de cada componente, asigna jugador (o "sin jugador": socio/hincha) y, si aplica, nombre y número.
3. Carrito: prendas, componentes, talles, jugador, personalización, cantidades, total, seña, saldo y envío.
4. Datos de contacto, modalidad de entrega y aceptación de condiciones.
5. **Revisión explícita** de nombres, números y talles por jugador.
6. Se crea el pedido en el servidor (reserva de cupo si corresponde) y recibe su enlace privado.
7. Paga la seña (o el total) con Mercado Pago o transferencia + comprobante.
8. Sigue el pedido con el mismo enlace: confirmación, fabricación, aviso de saldo, retiro con código QR.

### 4.2 Textil
1. Registra el club, su identidad y usuarios.
2. Carga prendas con talles y medidas, y arma productos (simples, conjuntos, combos).
3. Crea la campaña: colección y precios, ventana, seña, mínimo, cupo, retiro/envío, políticas, cuenta de cobro, beneficio.
4. Publica y difunde con enlace y QR.
5. Revisa comprobantes (si es destinataria) y sigue el avance.
6. Al cierre: si no se alcanzó el mínimo, registra la decisión (extender, cancelar, continuar).
7. Genera el lote con los pedidos que cumplen la condición de pago, lo aprueba (queda congelado) y lo pasa por los estados de fabricación.
8. Cambios posteriores → lote de ajuste.
9. Marca "Listo para despacho" / "Recibido por el club" y habilita el retiro.

### 4.3 Club
1. Consulta pedidos y métricas de su club.
2. Revisa comprobantes cuando la cuenta de cobro es del club.
3. Al recibir la mercadería, publica horarios de retiro; el sistema solicita el saldo.
4. El encargado de entrega busca por código o QR, verifica saldo y registra la entrega (total o parcial) con nombre de quien retira.
5. Ve su beneficio estimado y liquidado, si aplica.

---

## 5. Supuestos comerciales

> Esta sección describe el **modelo anterior (seña)**, que se conserva para las campañas existentes. Las campañas nuevas usan el modelo v2: ver la sección 6 y `docs/REQUISITOS.md`.

1. **Un destinatario de cobro por campaña** (textil o club). Sin reparto automático. **[Definir]** modelo de split si se requiere (Mercado Pago marketplace/OAuth).
2. Seña por defecto **50 %** sobre prendas + personalización; el **envío se cobra con el saldo**. Configurable: porcentaje o importe fijo, o pago total obligatorio, o elección del comprador.
3. El pedido queda **confirmado** cuando lo confirmado ≥ seña requerida. Por defecto, el lote incluye pedidos con seña aprobada (configurable: solo pagos completos).
4. **Reservas de cupo** solo cuentan si la campaña tiene cupo: Mercado Pago 30 min; transferencia 72 h o mientras el comprobante esté en revisión. Vencida la reserva, el pedido pasa a vencido y puede reactivarse si hay cupo.
5. Si un pago aprobado llega para un pedido vencido sin cupo, **no se descarta**: el pedido se confirma con marca de "excede cupo" para decisión administrativa.
6. Si no se alcanza el mínimo, **el sistema no decide**: un administrador registra extender, cancelar o continuar. Las devoluciones se registran manualmente; no hay devolución automática.
7. La condición de socio es **declarativa**; el número de socio no se presenta como verificado.
8. No se piden DNI ni fecha de nacimiento.
9. Entrega **bloqueada con saldo pendiente**; excepción solo para administrador de textil o club, con motivo obligatorio.
10. Beneficio del club: **registro comercial interno**. Base = precio de venta de prendas (sin personalización ni envío), neto de cancelaciones y devoluciones. Se fija al confirmarse el pedido.
11. Precios finales en ARS. **[Definir]** facturación electrónica (no incluida), quién absorbe la comisión de Mercado Pago, política de cambio de talle después del lote aprobado, operador logístico para envíos.
12. Zona horaria fija `America/Argentina/Buenos_Aires` (UTC−3, sin horario de verano).

---

## 6. Modelo comercial v2 (desde 08/10/2026)

Las reglas, supuestos y definiciones pendientes están en `docs/REQUISITOS.md`. Resumen técnico:

- `Campaign.pricingModel`: `TEXTIL_ADVANCE` (nuevas) o `LEGACY_DEPOSIT` (las existentes, migradas sin cambios). `Order.pricingModel` se copia al comprar y no cambia.
- Anticipo = Σ (precio textil + parte textil de adicionales). Saldo club = total − anticipo. Ambos se guardan en el pedido; `Payment.receiver` distingue TEXTIL o CLUB y `recomputeOrder` acumula por destinatario.
- Módulos nuevos: `campaigns/rules` (activación, precios, reglas, alcance), `catalog/options` (configurador compartido cliente/servidor) y `catalog/admin`, `agreements`, `samples` (muestrario y compras), `logistics` (envíos, remito, distribución).
- La migración `20261008030000_modelo_comercial_v2` crea las tablas nuevas, marca todo lo anterior como `LEGACY_DEPOSIT` y convierte la personalización de cada producto en grupos de opciones.
- Segunda revisión (`20261008200000`, `20261008200100`): `src/shared/advance.ts` calcula anticipo = total textil + `clubTaxBp` (24 %) de la diferencia del club, con el recargo aplicado también a los adicionales; `OrderUnit.advanceAmount` y `Order.clubTaxBp` guardan lo vigente al comprar. `ClubOrderSheet` (módulo `clubsheet`) es la planilla propia del club: no tiene relación de escritura con pedidos ni pagos. `assertTextilManages` impide que usuarios de club modifiquen pedidos v2.

## 7. Alcance del MVP

| Funcionalidad | Estado previsto |
|---|---|
| Clubes, prendas, productos, combos, talles y medidas | Real |
| Tienda por club y campaña, carrito multi-jugador, personalización por unidad | Real |
| Seña y saldo, registro de pagos, transferencias con comprobante y revisión | Real |
| Mercado Pago Checkout Pro + webhook verificado | Implementado, **pendiente de credenciales** |
| Simulador de pagos para pruebas | **Simulado**, rotulado, deshabilitado por defecto en producción |
| Lotes de producción, versiones y ajustes, exportación | Real |
| Entregas totales y parciales, código y QR de retiro | Real |
| Beneficio del club y liquidaciones | Real (registro interno) |
| Anticipo textil + saldo al club, activación de campañas, reglas por producto | Real |
| Acuerdos, muestrario, compras del club, envío consolidado, remito y distribución | Real |
| Integración con transportes y firma electrónica | No incluido (se registran como datos) |
| Correos | Plantillas reales; envío **pendiente de SMTP** (se registra "no enviado" si falta) |
| Devoluciones vía API de Mercado Pago | Pendiente (se registran manualmente) |

## 8. BACK: cuatro áreas, socios y permisos (desde 09/10/2026)

**Rutas**

| Área | Rutas | Acceso |
|---|---|---|
| Web comercial | `/`, `/propuesta`, `/nosotros`, `/contacto`, `/tu-club` (grupo `src/app/(web)`) | Pública. "Tu club" redirige según la sesión: panel o "Mis pedidos". |
| Panel compartido | `/admin/*` | Empresa: escritura. Club: solo lectura (inicio propio con saldo y resultado, campañas, pedidos, logística, compras del club, planilla si tiene el servicio, Excel). |
| Tienda del socio | `/club/<club>`, `/club/<club>/<campaña>` | Pública; comprar exige sesión de socio. |
| Socios | `/socios/ingresar`, `/socios/recuperar`, `/socios/restablecer/<token>`, `/mi-cuenta` | Cookie `back_socio` (30 días), separada de la del panel. |

**Módulos nuevos**: `brand` (marca y aprobación de la fórmula, `getBrand()` memoizado por request), `leads` (solicitudes de reunión), `members` (cuentas, sesiones, asociación al club), `purchases` (compras adicionales, revisión del lote, bloqueo por deuda).

**Permisos**: la matriz de capacidades deja al club solo con lectura (`campaign.view`, `orders.view`, `samples.view`, `benefit.view`, `reports.export`). Además, cada server action del panel arranca con `requireWriter()` y los módulos verifican el rol (precios, activación, publicación y cierre, pedidos, pagos, entregas, producción, recepción, planilla, compras), así que la restricción vale aunque se llame al servidor sin pasar por la interfaz. Las APIs del panel son de solo lectura (exportaciones).

**Datos**: `BrandSettings` (una fila), `Lead`, `Member`, `MemberSession`, `MemberPasswordReset`, `MemberClub`; `Order.memberId` y deducciones congeladas; `Campaign` con dos deducciones, tipo de días del plazo, inicio real de producción y políticas de cambio por tipo; `Club.memberNumberMode` y `debtBlockScope`; `ClubPurchase` con importe acordado, vencimiento, motivos y pagos (`ClubPurchasePayment`); `ProductionLotPurchaseItem` para sumar unidades del club a un lote de ajuste; `ImageView.SIZE_CHART`; `AuditLog.before/after`. Migración `20261009000000_back_marca_socios_formula` (aditiva).

**Hora del servidor**: la ventana de compra la decide `isWindowOpen` con la hora del servidor. Las cuentas regresivas reciben la hora del servidor y corrigen el desfase del dispositivo; son solo informativas.
