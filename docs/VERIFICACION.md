# Verificación automática

Fecha: 2026-10-09T00:38:35.559Z · Resultado: **51/51**

Pagos online verificados con el simulador interno (rotulado) y con el código real de Mercado Pago contra un simulador local de su API (`scripts/mock-mercadopago.mjs`). Falta la prueba con credenciales reales de Mercado Pago.

Los escenarios "Modelo anterior" verifican la compatibilidad con campañas de seña ya existentes; los "v2" verifican las reglas comerciales nuevas (anticipo textil + saldo al club).

| Escenario | Resultado | Detalle |
|---|---|---|
| Modelo anterior (seña): compra con varios jugadores, talles y prendas sin jugador | ✔ | 5 unidades, 2 jugadores, total 254000, seña 127000 |
| Conjunto y combo con talles independientes por componente | ✔ | camiseta S + short L; camiseta 2 + buzo 14 |
| Personalización por unidad (mismo talle, distinto nombre y número) | ✔ | nombres en mayúsculas por unidad; se rechazan caracteres inválidos, cantidad > 1 personalizada y productos sin personalización |
| Edición de una prenda antes de fabricar (talle, nombre, número y jugador) | ✔ | talle 10 → 12, nombre y número, cambio de jugador; quitar nombre resta $ 6.000; historial con antes y después |
| El servidor ignora importes enviados por el navegador y rechaza talles inexistentes | ✔ | total 34.000 aunque el navegador mande 1; talle 3 rechazado en prenda sin curva numérica |
| Reenvío idéntico del formulario no duplica el pedido | ✔ | mismo pedido JMZ-GN5Y |
| Volver de Mercado Pago no confirma el pago | ✔ | la página de retorno muestra 'Esperando la confirmación' |
| Seña aprobada por notificación verificada; notificaciones repetidas y concurrentes no duplican | ✔ | 1 pago aprobado tras 6 notificaciones; saldo 127000; firma falsa → 401; beneficio 8 % fijado al confirmar |
| Pago rechazado y reintento sobre el mismo pedido | ✔ | rechazado → nuevo intento → aprobado; un solo pedido |
| Mercado Pago: preferencia, webhook firmado, consulta del pago e idempotencia | ✔ | firma inválida → 401; aprobado una vez; reembolso refleja saldo; importe distinto no confirma |
| Transferencia: comprobante en revisión, rechazo con motivo, reemplazo y aprobación | ✔ | en revisión no descuenta saldo; el club no revisa; rechazo avisado; reemplazo enlazado; comprobantes privados |
| Mismo enlace privado para pagar la seña y después el saldo | ✔ | el enlace muestra la opción de saldo; tokens inventados → 404 |
| Separación de datos entre clubes y roles | ✔ | otro club: 404 en pedidos, campaña, exportación, entregas y comprobantes; roles limitados |
| Cupos concurrentes sin sobreventa | ✔ | 40 compras simultáneas, cupo 25 → 25 aceptadas, 15 rechazadas; al vencer las reservas se libera |
| Cierre de campaña: bloquea compras y conserva el catálogo | ✔ | 409 al comprar; catálogo visible sin compra; la tarea programada la pasa a Cerrada |
| Mínimo no alcanzado exige decisión administrativa explícita | ✔ | sin decisión no se consolida; decisión 'continuar' registrada |
| Consolidación para fabricación sin duplicar componentes | ✔ | CAM-TIT-26: 8 (sueltas + conjunto + combo); sin datos personales; lote aprobado y congelado |
| Una prenda enviada a fábrica no se puede editar | ✔ | rechazado con indicación de cancelar y volver a cargar |
| Cambios posteriores como lote de ajuste, sin alterar el lote aprobado | ✔ | ajuste: +1 combo (camiseta XL, buzo L), −1 buzo XL; lote 1 intacto |
| Snapshot de precios: editar el catálogo no altera pedidos | ✔ | precio, nombre y condiciones aceptadas conservados en el pedido |
| Producción hasta el club y aviso de saldo | ✔ | lotes avanzan en orden; inicio real registrado; la empresa confirma la llegada al club; avisos de producción, retiro y saldo |
| Entrega bloqueada con saldo; excepción solo autorizada y con motivo | ✔ | el club (consulta) no registra entregas; la empresa entrega con saldo solo con motivo registrado |
| Saldo pagado con el mismo enlace y entrega parcial y total | ✔ | saldo 65000 pagado; 3 entregas (excepción, parcial, resto) con quién retiró y cuándo |
| Pago externo comunicado por el club y registrado por la empresa; entrega con el QR | ✔ | el club no registra pagos; la empresa registra el pago comunicado; el QR solo abre el pedido con sesión de la empresa |
| Recuperar el enlace del pedido por correo, sin revelar si el correo existe | ✔ | correo con sus enlaces; repetición limitada; correo inexistente sin efecto visible |
| Contraseña: cambio propio y restablecimiento con enlace de un solo uso | ✔ | contraseña actual requerida; cierra otras sesiones; enlace único, con vencimiento y sin revelar cuentas |
| Correos: sin proveedor quedan registrados como no enviados | ✔ | 65 correos registrados como "no enviado: falta proveedor"; 0 marcados como enviados |
| Páginas del panel responden para cada rol | ✔ | 14 combinaciones de rol y página |
| v2 · Precio BACK $10.000, final $13.000: anticipo $10.735 (B + 24,5 % de G) y saldo $2.265 al club | ✔ | total 13.000 · anticipo 10.735 (deducciones no visibles al socio) · saldo 2.265 (club) |
| v2 · Anticipo aprobado con saldo al club pendiente: confirmado, nunca 'pagado' | ✔ | estados separados: Anticipo aprobado · Saldo a pagar al club; sin cobro online del saldo |
| v2 · Precio final igual al textil: saldo al club $0 | ✔ | 2 musculosas: total = anticipo = 18.000; sin saldo |
| v2 · Fórmula configurable y redondeo: B 10.000, P 13.000 → G 3.000, D 735, A 10.735, S 2.265 | ✔ | G 3.000 · D 735 · A 10.735 · S 2.265; con adicional 15.600 / 12.882; redondeo al centavo; P < B rechazado |
| v2 · Pedido con varios ítems y adicionales (de la textil, con el recargo del club) | ✔ | total 52.050 · anticipo 43.329,75 · saldo club 8.720,25; adicionales de la empresa con recargo; política de cambios aceptada |
| v2 · Personalización condicional por unidad | ✔ | nombre sin leyenda → rechazado; nombre de a una; 5 unidades con leyenda/nombre propios |
| v2 · Cambio de talle: personalizada no admite cambio voluntario; error de carga o de la textil sí, con motivo | ✔ | el club no edita; voluntario rechazado; error de la textil con nota registrado |
| v2 · Tienda: sin envío a domicilio, texto de financiación exacto, muestrario y demo identificada | ✔ | envío rechazado; texto MP exacto; aviso de muestrario; catálogo con estados; acuerdo privado |
| v2 · Activación y precios: solo la empresa; el club no escribe; reglas y precios bloqueados al publicar | ✔ | precios, activación, compromiso y publicación solo la empresa (el club rechazado); final ≥ precio de la empresa; historial con valor anterior y nuevo |
| v2 · Campaña de categoría completa (11 jugadores) con aprobación excepcional | ✔ | M14 rechazado; 8 de 11 retiene la producción; con aprobación excepcional registrada se consolidan las 8 |
| v2 · Consolidación: prendas base por modelo y talle, personalización aparte sin fragmentar | ✔ | remeras vendidas 7: el club compra 13 (talles sugeridos); prendas base juntas; trabajos: leyenda RUGBY 3, HOCKEY 2, nombres 3 |
| v2 · Producción completa entregada al club: envío consolidado, remito y recepción | ✔ | lote → envío (flete a cargo del comprador) → despachado → recepción confirmada por la empresa; aviso de disponibilidad; lista con saldo |
| Compra adicional del club después del cierre: separada de los socios, revisión del lote y bloqueo por deuda | ✔ | registrada por la empresa (el club no puede); fuera de las ventas a socios; lote de ajuste aprobado sin tocar el original; impaga no se despacha; bloqueo total configurable |
| Excel de pedidos y producción: 5 hojas, una fila por combinación homogénea, sin duplicar cantidades | ✔ | 9 filas de socios para 11 unidades; anticipos sin duplicar; 5 hojas; el club lo descarga |
| v2 · Seguimiento hasta 'en el club'; saldo y retiro registrados por la empresa en la planilla, sin afectar el pedido | ✔ | el club no cancela ni carga datos; la empresa registra en la planilla lo comunicado (con valor anterior y nuevo); el pedido y los pagos no cambian |
| v2 · Conciliación Mercado Pago: bruto, pagado por el comprador (con intereses) y neto | ✔ | sin fórmula aprobada no se cobra; aprobada: bruto 30980 · comprador 34697.6 (6 cuotas) · neto 29031.36 · comisión 1948.64 |
| v2 · Pedidos anteriores conservan precios y condiciones | ✔ | sin recálculo retroactivo: anticipo, saldo y precio por prenda quedan como al comprar |
| v2 · Acuerdo privado: aviso de vencimiento una sola vez y nada público | ✔ | alerta a 45 días; sin duplicar; acuerdo invisible para el club y la tienda (salvo la línea de marca) |
| v2 · Páginas nuevas del panel por rol | ✔ | 21 combinaciones |
| BACK · Web comercial, marca configurable, solicitud de reunión y acceso por rol | ✔ | 9 secciones y navegación; marca editable solo por la empresa (con historial); solicitud de reunión; Tu club según rol |
| BACK · Socio: inicia sesión para pagar, conserva club y carrito, y ve solo sus pedidos | ✔ | 401 sin sesión; acceso con club y retorno al carrito; Mis pedidos solo propios; asociación ≠ membresía validada |
| BACK · El club no escribe, ni por la interfaz ni llamando al servidor | ✔ | toda acción del panel exige usuario de escritura; módulos rechazan al club; panel del club en solo lectura |
| BACK · Productos activos, próximos y finalizados según la hora del servidor | ✔ | próximamente con apertura; finalizada sin compra; el servidor rechaza fuera de la ventana |

## Uso desde celular

Recorrido completo en Chromium sin interfaz con viewport de 390 × 844 (táctil), contra el build de producción (`next build`, servidor standalone):

| Pantalla | Resultado |
|---|---|
| Tienda del club | ✔ sin desplazamiento horizontal |
| Campaña y colección | ✔ |
| Ficha de producto (conjunto con talle por componente, jugador nuevo, nombre y número) | ✔ |
| Carrito por jugador | ✔ |
| Revisión de nombres, números y talles | ✔ |
| Pedido creado desde el celular, pago por transferencia | ✔ redirige al enlace privado con los datos bancarios |
| Panel: inicio, pedidos, entregas y campaña | ✔ |
| Recuperar enlace del pedido, recuperar contraseña e ingreso | ✔ |
| Pedido en el panel con el formulario de edición de una prenda abierto | ✔ |

Modelo v2 (08/10/2026), misma configuración, piloto demo:

| Pantalla | Resultado |
|---|---|
| Tienda demo con banner de demostración | ✔ sin desplazamiento horizontal (ancho 390) |
| Configurador guiado: talle, jugador, leyenda, nombre condicional, aviso de cambios | ✔ |
| Resumen del ítem: total, anticipo y saldo al club | ✔ $ 17.000 · $ 13.500 · $ 3.500 |
| Carrito: anticipo por Mercado Pago, saldo al club, texto de financiación y política de cambios | ✔ |

Capturas en `docs/capturas/` (las del modelo v2 empiezan con `v2-`).

## Qué no se pudo probar en este entorno

- **Mercado Pago real.** Se probó el código de producción contra un simulador local de su API. Falta una prueba con credenciales de prueba (TEST-…) o reales y el webhook configurado en el panel de Mercado Pago.
- **Imagen Docker.** Docker Hub no es accesible desde este entorno. Se verificó el build `standalone` aislado, el seed empaquetado y el arranque sin variables en el build; el `Dockerfile` debe construirse por primera vez en Coolify.
- **Datos reales del piloto.** El club de Virreyes se muestra con escudo genérico, colores y precios de ejemplo.
- **Envío de correos.** Sin SMTP configurado; se verificó que los avisos quedan registrados como "no enviados".
