# Verificación automática

Fecha: 2026-10-07T19:49:49.656Z · Resultado: **24/24**

Pagos online verificados con el simulador interno (rotulado) y con el código real de Mercado Pago contra un simulador local de su API (`scripts/mock-mercadopago.mjs`). Falta la prueba con credenciales reales de Mercado Pago.

| Escenario | Resultado | Detalle |
|---|---|---|
| Compra con varios jugadores, talles y prendas sin jugador | ✔ | 5 unidades, 2 jugadores, total 254000, seña 127000 |
| Conjunto y combo con talles independientes por componente | ✔ | camiseta S + short L; camiseta 2 + buzo 14 |
| Personalización por unidad (mismo talle, distinto nombre y número) | ✔ | nombres en mayúsculas por unidad; se rechazan caracteres inválidos, cantidad > 1 personalizada y productos sin personalización |
| El servidor ignora importes enviados por el navegador y rechaza talles inexistentes | ✔ | total 34.000 aunque el navegador mande 1; talle 3 rechazado en prenda sin curva numérica |
| Reenvío idéntico del formulario no duplica el pedido | ✔ | mismo pedido TGF-VA9W |
| Volver de Mercado Pago no confirma el pago | ✔ | la página de retorno muestra 'Esperando la confirmación' |
| Seña aprobada por notificación verificada; notificaciones repetidas y concurrentes no duplican | ✔ | 1 pago aprobado tras 6 notificaciones; saldo 127000; firma falsa → 401; beneficio 8 % fijado al confirmar |
| Pago rechazado y reintento sobre el mismo pedido | ✔ | rechazado → nuevo intento → aprobado; un solo pedido |
| Mercado Pago: preferencia, webhook firmado, consulta del pago e idempotencia | ✔ | firma inválida → 401; aprobado una vez; reembolso refleja saldo; importe distinto no confirma |
| Transferencia: comprobante en revisión, rechazo con motivo, reemplazo y aprobación | ✔ | en revisión no descuenta saldo; rechazo avisado; reemplazo enlazado; comprobantes privados |
| Mismo enlace privado para pagar la seña y después el saldo | ✔ | el enlace muestra la opción de saldo; tokens inventados → 404 |
| Separación de datos entre clubes y roles | ✔ | otro club: 404 en pedidos, campaña, exportación, entregas y comprobantes; roles limitados |
| Cupos concurrentes sin sobreventa | ✔ | 40 compras simultáneas, cupo 25 → 25 aceptadas, 15 rechazadas; al vencer las reservas se libera |
| Cierre de campaña: bloquea compras y conserva el catálogo | ✔ | 409 al comprar; catálogo visible sin compra; la tarea programada la pasa a Cerrada |
| Mínimo no alcanzado exige decisión administrativa explícita | ✔ | sin decisión no se consolida; decisión 'continuar' registrada |
| Consolidación para fabricación sin duplicar componentes | ✔ | CAM-TIT-26: 8 (sueltas + conjunto + combo); sin datos personales; lote aprobado y congelado |
| Cambios posteriores como lote de ajuste, sin alterar el lote aprobado | ✔ | ajuste: +1 combo (camiseta XL, buzo L), −1 buzo XL; lote 1 intacto |
| Snapshot de precios: editar el catálogo no altera pedidos | ✔ | precio, nombre y condiciones aceptadas conservados en el pedido |
| Producción hasta el club y aviso de saldo | ✔ | lotes avanzan en orden; pedidos listos; avisos de producción, retiro y saldo (uno por pedido) |
| Entrega bloqueada con saldo; excepción solo autorizada y con motivo | ✔ | encargado de entregas: bloqueado; administrador del club: entrega con motivo registrado |
| Saldo pagado con el mismo enlace y entrega parcial y total | ✔ | saldo 65000 pagado; 3 entregas (excepción, parcial, resto) con quién retiró y cuándo |
| Pago en efectivo registrado por el club y entrega con el QR | ✔ | saldo en efectivo registrado; el QR solo abre el pedido con sesión del club |
| Correos: sin proveedor quedan registrados como no enviados | ✔ | 62 correos registrados como "no enviado: falta proveedor"; 0 marcados como enviados |
| Páginas del panel responden para cada rol | ✔ | 8 combinaciones de rol y página |
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

Capturas en `docs/capturas/`.

## Qué no se pudo probar en este entorno

- **Mercado Pago real.** Se probó el código de producción contra un simulador local de su API. Falta una prueba con credenciales de prueba (TEST-…) o reales y el webhook configurado en el panel de Mercado Pago.
- **Imagen Docker.** Docker Hub no es accesible desde este entorno. Se verificó el build `standalone` aislado, el seed empaquetado y el arranque sin variables en el build; el `Dockerfile` debe construirse por primera vez en Coolify.
- **Envío de correos.** Sin SMTP configurado; se verificó que los avisos quedan registrados como "no enviados".
