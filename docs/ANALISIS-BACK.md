# Actualización BACK — análisis previo

Fecha: 8 de octubre de 2026. Este documento resume cómo se aplican los nuevos requisitos sobre la plataforma existente antes de tocar el código. Cuando contradicen requisitos anteriores, mandan estos (en especial los permisos del club y la composición del anticipo).

## 1. Cambios respecto de lo existente

| Tema | Hoy | Con BACK |
|---|---|---|
| Marca | "Walkersport" por variable de entorno y logo WKR fijo | Marca **configurable desde el panel** (nombre, logo, colores, datos de contacto). Nombre provisorio: **BACK**. |
| Portada pública | Listado de tiendas abiertas | **Web comercial** con 9 secciones al hacer scroll, navegación Inicio · Propuesta · Nosotros · Contacto · Tu club, simulador económico y solicitud de reunión. |
| Permisos del club | Administra su club: pide activaciones, edita precios al socio, compromete compras, registra retiros y su planilla de gestión, recibe envíos | **Solo lectura** sobre su club, en servidor y APIs. Consulta y exporta. Todas las escrituras pasan a la empresa, incluidas las novedades y pagos externos que el club comunique. |
| Comprador | Compra sin cuenta con correo y teléfono | **Socio con cuenta**: explora y arma el carrito sin sesión, inicia sesión (o se registra) antes de pagar, conserva el carrito y el club elegido, consulta solo sus pedidos. |
| Anticipo | B + 24 % de la diferencia del club | B + **deducciones configurables** sobre G (hipótesis 21 % + 3,5 % = 24,5 %). Fórmula marcada como **pendiente de aprobación**: sin aprobación no se habilitan cobros reales. |
| Mercado Pago | Bruto, pagado por el comprador y neto | Se agrega la **comisión como costo de BACK**, la **parte de BACK** y los **otros importes incluidos** en el anticipo (D). |
| Productos en la tienda | "Pendiente de preventa" en el catálogo | **Próximamente** (atenuado, sin compra), **activo** (precio, cierre con fecha y hora, cuenta regresiva, compra) y **Preventa finalizada**. El servidor decide el cierre. |
| Recursos del producto | Imágenes libres | **Frente, espalda y tabla de talles** (también como tabla legible) + guía visual para medir y aviso sobre elastano. |
| Confirmación | Texto propio | **Texto exacto** del cliente, con importe abonado, saldo al club, cierre y ventana estimada. Se registra el **inicio real** de producción. |
| Excel | Exportación de campaña y lote | **XLSX de 5 hojas** para la empresa y el club (solo su club). |
| Compra adicional del club | Compras de muestrario, mínimo y respaldo | Además, **compra posterior al cierre** registrada por BACK (productos, talles, cantidades, precio acordado, pagos, vencimiento, motivo, responsable), sumada al lote por **revisión aprobada** y con **bloqueo por deuda**. |
| Historial | Registro de acciones | Toda modificación sensible guarda **usuario, fecha, valor anterior y nuevo**. |

Se conservan: exclusividad y acuerdos, catálogo hasta 48 artículos, mínimos por tipo de producto (pool de categoría, outfit con mínimo 20 y compra de la diferencia), audiencias por deporte y categoría, curva de talles 1-2-3 y S a 5XL, muestrario, personalización por unidad, política de cambios, envío consolidado y planilla del club (ahora la carga la empresa).

## 2. Modelo de las cuatro áreas

**A. Web comercial (pública)** — `/`, `/propuesta`, `/nosotros`, `/contacto`, `/tu-club`.
"Tu club" lleva al acceso; con sesión iniciada redirige según el rol: empresa y club al panel, socio a "Mis pedidos".

**B. Panel compartido** — `/admin/*` con dos perfiles:
- *Empresa BACK*: administra todo.
- *Club (consulta)*: solo su club, sin un solo control de edición; el servidor rechaza cualquier escritura aunque se intente por API.

**C. Tienda del socio** — `/club/[club]` y `/club/[club]/[campaña]`: logo, colores, descripción, proceso, catálogo con estados, campañas activas y próximas, configurador y carrito.

**D. Checkout y seguimiento** — revisión y desglose, acceso del socio (`/club/[club]/ingresar`), Mercado Pago, regreso, `/pedido/[token]` y `/mi-cuenta` (pagos, producción, disponibilidad y saldo a pagar solo al club).

## 3. Reglas confirmadas

1. Cada pedido pertenece a un club y una campaña; no se mezclan clubes en un checkout.
2. El socio debe iniciar sesión antes de pagar; el carrito y el club se conservan al registrarse o ingresar.
3. El número de socio solo se pide si el club lo configura. Asociarse a un club no equivale a membresía validada.
4. La empresa carga y modifica precios; el club acuerda su rentabilidad fuera del sistema.
5. Validaciones del importe: P ≥ B; A ≤ P (deducciones incluidas en P); A + S = P; S ≥ 0. Importes en centavos con redondeo explícito.
6. Precios, fórmula y condiciones quedan guardados en el pedido.
7. Las cuotas y su costo financiero son los que ofrece Mercado Pago y los paga el comprador. La comisión de procesamiento es costo de BACK.
8. El pago se confirma solo desde el servidor (notificación verificada + consulta); el regreso del navegador no prueba nada. Estados: aprobado, pendiente de confirmación, rechazado, cancelado. Reintentar no duplica pedidos.
9. La producción empieza al cierre; plazo estimado de 30 a 45 días. La textil entrega toda la producción al club y el club distribuye.
10. El saldo se paga exclusivamente al club; no se ofrece pagarlo a BACK.
11. Prendas con nombre y/o número no admiten cambio voluntario de talle; se informa al configurar y antes de pagar y se registra la aceptación. Defectos y errores de fabricación van aparte.
12. Las unidades adicionales del club no se liberan si no están pagas.
13. Solo BACK modifica precios, abre o cierra campañas, carga compras adicionales, registra pagos externos, actualiza producción y confirma disponibilidad y entrega.

## 4. Hipótesis y decisiones pendientes

| # | Tema | Cómo queda mientras tanto |
|---|---|---|
| 1 | **Fórmula del anticipo**: si 21 % y 3,5 % se aplican ambos sobre G, si se suman, si se descuentan de la diferencia incluida en P o se agregan al precio, a quién corresponde D y cómo se documenta y liquida | Hipótesis: D = G × 24,5 %, incluida en P. Ejemplo: B 10.000, P 13.000 → G 3.000, D 735, A 10.735, S 2.265. Porcentajes editables por la empresa. D se llama "deducciones sobre la diferencia del club", nunca IVA ni retención. **Cobros reales bloqueados** hasta que la empresa registre la aprobación de la fórmula; el simulador sigue disponible. |
| 2 | Plazo de 30 a 45 días: ¿corridos o hábiles? | Se muestra "30 a 45 días (a confirmar si son corridos o hábiles)". Configurable por campaña. |
| 3 | Bloqueo por deuda del club: ¿solo las unidades adicionales o todo el despacho? | Por defecto, solo las unidades adicionales. La opción "todo el despacho" existe y se marca como decisión comercial. |
| 4 | Política de cambios para prendas con leyenda de disciplina y productos no personalizados | Texto configurable por campaña; no se asume nada. |
| 5 | Relación entre BACK y Walkersport (marca de la plataforma o del fabricante), logo y colores definitivos | Marca BACK con logotipo tipográfico y colores editables. Los bocetos de Virreyes conservan el logo WKR que tienen impreso. |
| 6 | Textos institucionales de "Nosotros", correo y WhatsApp de contacto de BACK | Se editan desde el panel; mientras no se carguen, la sección muestra solo lo que describe el servicio. |
| 7 | Medidas, composición y elasticidad por producto | Son datos por producto; si faltan, la tienda lo dice en vez de inventarlos. |

## 5. Impacto en pantallas y datos

**Datos (migración aditiva, sin perder información):**
- `BrandSettings`: nombre, logo, colores, contacto, textos de Nosotros, aprobación de la fórmula (quién y cuándo), bloqueo por deuda por defecto.
- `Lead`: solicitudes de reunión desde la web comercial.
- `Member`, `MemberSession`, `MemberClub`: socios, sesiones, asociación al club con número de socio opcional y estado de validación. `Order.memberId`.
- `Club.requireMemberNumber`.
- `Campaign`: porcentajes de deducción (dos componentes), tipo de días del plazo, inicio real de producción, política de cambios de leyenda y no personalizados, bloqueo por deuda.
- `Order` / `OrderUnit`: deducciones y fórmula congeladas al comprar.
- `Payment`: comisión del proveedor, neto, parte BACK y otros importes.
- `ClubPurchase`: precio acordado, importe, pagos, vencimiento, motivo, responsable, origen "posterior al cierre"; ítems por producto y talle; `ClubPurchasePayment`; incorporación al lote por revisión aprobada.
- `ImageView.SIZE_CHART` para la tabla de talles como imagen.
- `AuditLog`: valor anterior y nuevo en cada cambio sensible.

**Pantallas:**
- Nuevas: web comercial (5 rutas), acceso y registro del socio, "Mis pedidos", Marca (panel), Solicitudes de reunión (panel), compra adicional posterior al cierre.
- Cambian: tienda (estados y cuenta regresiva por producto, recursos frente/espalda/talles, guía de medición), checkout (sesión y desglose), página del pedido (confirmación y seguimiento), panel del club (solo lectura, saldo a cobrar y resultado estimado), campaña (fórmula, plazos, inicio real), producción (revisión del lote), exportaciones.
- Se quitan para el club: solicitar activación, editar precios, comprometer compras, registrar retiros, cargar su planilla y recibir envíos.
