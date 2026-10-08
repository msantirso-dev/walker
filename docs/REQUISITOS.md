# Requisitos vigentes

Fuente de verdad de reglas comerciales del proyecto. Versión 2 (07/10/2026), a partir de las definiciones de Fernando Demathias. Reemplaza los supuestos incompatibles de `ARQUITECTURA.md` (seña fija del 50 %, envíos individuales y mínimo único de producción).

Convenciones: **[Confirmado]** regla del cliente; **[Provisional]** valor editable que el sistema usa mientras no haya definición; **[Pendiente]** decisión comercial abierta: el sistema no activa comportamientos que comprometan cobros, producción o promesas al comprador.

---

## 1. Resumen de cambios frente a la versión 1

| Tema | Versión 1 | Versión 2 |
|---|---|---|
| Cobro online | Seña configurable (50 % por defecto) o pago total | **Anticipo = 100 % del precio textil**, por Mercado Pago a la cuenta de la textil |
| Saldo | Lo cobra el mismo destinatario por el mismo canal | **Saldo = precio al socio − anticipo**; lo cobra el club y se registra manualmente |
| Precio | Precio de preventa único por producto | **Precio textil** (lo fija la textil) y **precio al socio** (lo fija el club, directo o con recargo %) |
| Entrega | Retiro en sede o envío a domicilio | **Entrega consolidada textil → club**; el club distribuye. Sin envío a domicilio en el checkout |
| Mínimos | Un mínimo por campaña | **Reglas por producto**: categoría completa (prendas de juego) o compra inicial del club (outfit) |
| Personalización | Nombre y número fijos | **Configurador por grupos de opciones** con dependencias, obligatoriedad y costos textil/club |
| Activación | La textil crea y publica | **El club solicita** (productos, momento y alcance); **la textil aprueba** antes de abrir |
| Acuerdo con el club | No existía | **Acuerdo privado** con vigencia, exclusividad, muestrarios y compras iniciales, con alertas |
| Muestrario | No existía | **Curvas de talles** por club y equivalencias aprobadas por producto |
| Beneficio del club | Regla interna % o fijo | En campañas nuevas, el ingreso del club es el **saldo**; la regla anterior queda para campañas existentes |

Los pedidos y campañas existentes conservan sus precios y reglas (modelo "seña" heredado). Las reglas nuevas aplican a campañas nuevas.

## 2. Reglas confirmadas

### 2.1 Modelo comercial
- La textil desarrolla y fabrica; cada club tiene identidad propia, catálogo digital, productos por disciplina y categoría, y decide cuándo activar campañas. **[Confirmado]**
- La textil entrega toda la producción al club; no entrega a compradores individuales. El club organiza el retiro. **[Confirmado]**

### 2.2 Precios y cobros
- Precio textil: lo que la textil necesita cobrar. Precio al socio: lo define el club, ingresándolo directo o con un recargo % sobre el precio textil (30 % sobre $10.000 = $13.000). **[Confirmado]**
- El precio al socio no puede ser menor que el precio textil. Si es igual, el saldo del club es cero. **[Confirmado]**
- Anticipo online = 100 % del precio textil (más la parte textil de los adicionales), por Mercado Pago en la cuenta de la textil. Sin reparto automático. **[Confirmado]**
- Saldo club = precio al socio − anticipo. Se registra manualmente (fecha, medio, referencia) por un usuario autorizado. El cobro online del saldo no es requisito. **[Confirmado]**
- Cada pedido guarda copia de precios y reglas al confirmarse; los cambios posteriores no lo alteran. **[Confirmado]**
- El comprador ve: precio total, importe a pagar ahora, saldo al club y quién cobra cada importe. Nunca costos internos, rentabilidad ni condiciones del contrato. **[Confirmado]**
- Estados separados: anticipo (pendiente/aprobado), saldo club (pendiente/cobrado), producción y entrega. Con anticipo aprobado el pedido entra a producción aunque deba el saldo; no se muestra como "pagado" mientras haya saldo. **[Confirmado]**

### 2.3 Mercado Pago
- El comprador elige la financiación que Mercado Pago ofrezca. No se prometen cuotas ni cuotas sin interés. Antes del checkout se muestra: "El pago y las opciones de financiación se gestionan mediante Mercado Pago. Consultá las condiciones disponibles al pagar." **[Confirmado]**
- Confirmación solo desde el servidor (webhook firmado + consulta del pago), idempotente, con reintentos sin duplicar pedidos. **[Confirmado]**
- Conciliación: por cada pago se guarda el importe de la operación (`transaction_amount`), lo pagado por el comprador incluyendo intereses de financiación (`transaction_details.total_paid_amount`), lo neto acreditado (`transaction_details.net_received_amount`) y el detalle de cargos (`fee_details`). El anticipo se valida contra el importe de la operación, no contra lo neto. Los intereses de financiación (pagados por el comprador) se distinguen de las comisiones de procesamiento (descontadas a la textil). **[Confirmado]** El cálculo exacto debe contrastarse con pagos reales. **[Pendiente]**

### 2.4 Entrega consolidada
- Sin envío a domicilio en el checkout. El pedido muestra club destinatario, sede de retiro, instrucciones, horarios y disponibilidad. **[Confirmado]**
- Despacho textil → club con dirección, responsable de recepción, transporte o modalidad (ej. Via Cargo, sin integración), referencia, fecha de despacho y de recepción. **[Confirmado]**
- Documentos: remito consolidado para el club, listado de distribución por comprador y jugador, registro de retiros. **[Confirmado]**
- Entrega al socio bloqueada con saldo pendiente, salvo excepción autorizada y registrada. **[Confirmado]**

### 2.5 Acuerdo comercial privado
- Se registra por club: exclusividad (un año), inicio y vencimiento, marca propia "by [marca textil]", muestrarios comprometidos, catálogo acordado, condiciones de activación, compras iniciales, reglas de precios y cobros, contrato adjunto. Nunca se publica. Alertas de vencimiento. Sin firma electrónica en esta etapa. **[Confirmado]**

### 2.6 Muestrario de talles
- El club compra curvas para que los socios se prueben: inicialmente una curva superior (remera) y una inferior (short); no una por producto. Se registra tipo, prenda de referencia, talles, cantidades, fecha de entrega, disponibilidad y lugar. Cantidad de talles configurable. **[Confirmado]**
- Varios productos pueden referirse a una curva, pero la equivalencia la aprueba la textil por producto. **[Confirmado]**
- Ficha pública: "Podés probarte el muestrario en el club antes de elegir tu talle." cuando el producto tiene una equivalencia aprobada y la curva está disponible. El talle se elige siempre de forma explícita. **[Confirmado]**

### 2.7 Muestrario, compra inicial y respaldo
- Son conceptos distintos que se registran por separado; una misma compra puede vincularse a más de una función cuando el cliente lo confirme. **[Confirmado]**
- La distribución por talle del respaldo se decide manualmente entre textil y club; el sistema muestra los pedidos por talle como referencia, sin asignar nada. **[Confirmado]**

### 2.8 Catálogo y activación
- Estados por producto: en preparación, disponible en catálogo sin venta, en preventa activa, con preventa cerrada, archivado. **[Confirmado]**
- El club elige producto, momento y alcance (todo el club, una o varias disciplinas, una o varias categorías). La solicitud de activación es distinta de la aprobación de la textil, que verifica las condiciones antes de abrir. **[Confirmado]**

### 2.9 Reglas de producción por producto
- No hay un mínimo único. Familia comercial (prenda de juego, outfit, accesorio) y técnica de fabricación (sublimado, no sublimado, bordado, etc.) son campos separados; ninguna regla se deduce del nombre. **[Confirmado]**
- Prendas de juego: campaña de categoría completa con cantidad esperada, cantidad confirmada, aprobación de la textil y excepción a la compra inicial. Once no es un mínimo universal ni hay aprobación automática. **[Confirmado]**
- Outfit: para abrir, el club asume una compra inicial mínima editable por producto o campaña; se registran cantidad comprometida, pagada, distribución por talles y aprobación. La campaña no se habilita si no cumple. **[Confirmado]**

### 2.10 Outfit con leyenda por disciplina
- Un modelo único con leyenda elegida por el comprador (Futsal, Patín, Básquet, Rugby…). La producción separa prendas base por modelo y talle de los trabajos de personalización por unidad, sin fragmentar el lote base. **[Confirmado]**

### 2.11 Configurador guiado
- Pasos: producto, talle, disciplina o categoría (jugador), personalización, nombre o número, cantidad, revisión de total, anticipo y saldo. El administrador configura grupos de opciones, obligatoriedad, valores, dependencias, costos y límites. Personalización por unidad. **[Confirmado]**

### 2.12 Cambios de talle
- Prendas con nombre o número: sin cambio de talle (voluntario). Se informa en la ficha, al elegir la personalización y antes de confirmar, y se registra la versión aceptada. **[Confirmado]**
- Un cambio voluntario no es lo mismo que una falla de fabricación o un error de la textil: la política no rechaza reclamos de forma automática. **[Confirmado]**
- Prendas no personalizadas: el cambio depende de la política aprobada y de las unidades disponibles; no se promete. **[Confirmado]**

### 2.13 Piloto y propuesta
- Propuesta demostrativa para un club de rugby de Virreyes, centrada en verano (remera, short de verano, musculosa, bolso), sin precios reales, convenios, logos ni avales. **[Confirmado]**
- Borrador de propuesta comercial separado y no publicado. **[Confirmado]**

## 3. Supuestos provisionales (editables)

| Supuesto | Valor usado | Dónde se cambia |
|---|---|---|
| Compra inicial mínima de outfit | 15 unidades, marcado "estimado" | Por producto en la campaña |
| Cantidad esperada en categoría completa | La que cargue la textil (ej. 11) | Por producto en la campaña |
| Reparto textil/club de cada adicional | Se carga explícitamente; por defecto 100 % textil y marcado "a definir" | Opciones del producto |
| Marca textil en "by …" | Variable `TEXTIL_BRAND` (por defecto "Marca Textil"); la línea solo se muestra si hay un acuerdo vigente | Entorno y acuerdo del club |
| Transferencia para el anticipo | Deshabilitada en campañas nuevas (solo Mercado Pago) | Configuración de la campaña |
| Exclusividad | 12 meses desde el inicio | Acuerdo del club |
| Alerta de vencimiento del acuerdo | 60 días antes | Acuerdo del club |
| Política de cambio para leyendas de disciplina | La leyenda no bloquea el cambio de talle; nombre y número sí. Configurable por grupo de opciones ("completarlo bloquea el cambio de talle") | Opciones del producto |
| Producción con anticipo | Entra al lote todo pedido con anticipo aprobado; el saldo al club no frena la producción | Fijo en el modelo v2 |
| Regla al agregar un outfit a una campaña | Se propone "compra inicial" con mínimo 15 (estimado); igual requiere aprobación de la textil | Regla del producto en la campaña |

## 4. Definiciones pendientes

1. Quién paga el transporte textil → club y su costo (no se asume envío gratuito).
2. Reparto textil/club del precio de cada adicional (nombre, número, leyenda).
3. Política de cambio para prendas con leyenda de disciplina y para prendas no personalizadas.
4. Confirmación del mínimo de compra inicial de outfit (15 es estimado).
5. Relación entre sublimado/no sublimado y prenda de juego/outfit.
6. Compra de respaldo: compromiso de cantidad antes de abrir y distribución por talle al cerrar.
7. Si una misma compra puede cumplir funciones de muestrario, compra inicial y respaldo.
8. Conciliación con Mercado Pago: tratamiento de comisiones y de intereses de financiación, a verificar con pagos reales.
9. Denominación de la marca textil.
10. Datos oficiales del club de Virreyes (nombre, escudo, colores) y su aprobación.

## 5. Pantallas y entidades afectadas

**Entidades nuevas:** acuerdo del club (`ClubAgreement`), curva de muestrario y sus talles (`SizeSampleSet`, `SizeSampleItem`), equivalencia producto–curva (`ProductSampleLink`), compra del club y su distribución (`ClubPurchase`, `ClubPurchaseItem`), grupos y valores de opciones (`ProductOptionGroup`, `ProductOptionValue`), opciones por unidad (`OrderUnitOption`), despacho al club (`ClubShipment`).

**Entidades modificadas:** club (demostración), producto (estado de catálogo, familia, técnica), campaña (modelo de precios, alcance por disciplina y categoría, solicitud y aprobación), producto de campaña (precio textil, recargo, regla de producción), pedido (anticipo y saldo club separados, versión de política), unidad (precio textil, adicionales textil/club, sin cambio de talle), pago (destinatario, fecha, conciliación), lote (despacho).

**Pantallas:**
- Tienda: catálogo del club con estados, campaña con alcance, configurador guiado, aviso de muestrario, política de cambios, texto de Mercado Pago, retiro en el club, banner de demostración.
- Pedido del comprador: anticipo y saldo club separados, club destinatario y retiro.
- Panel: acuerdos (con alertas), muestrarios y equivalencias, compras del club, catálogo (estado, familia, técnica, opciones), solicitud y aprobación de campañas, precio textil y precio al socio, reglas por producto, registro del saldo club, despachos al club con remito, listado de distribución y registro de retiros, reporte de fabricación con prendas base y trabajos de personalización.

## 6. Estado de implementación (08/10/2026)

Verificación automática: **44/44** escenarios (`docs/VERIFICACION.md`): 28 del modelo anterior, que siguen funcionando para campañas con seña, y 16 del modelo v2.

**Implementado**

- Precio textil y precio al socio por producto de campaña (directo o recargo %), validación final ≥ textil, bloqueo de cambios con la campaña publicada y nueva autorización si el club cambia precios ya autorizados.
- Anticipo = precio textil + parte textil de los adicionales, cobrado online por Mercado Pago a la cuenta de la textil; saldo club = final − anticipo, registrado a mano por el club o la textil (fecha, medio, referencia). Sin reparto automático.
- Estados separados de anticipo y saldo al club en la tienda, el pedido, el panel, los correos y los reportes; un pedido nunca figura como "pagado" con saldo al club pendiente; precio final = textil → saldo 0.
- Texto exacto de financiación de Mercado Pago; sin promesas de cuotas. Conciliación guardada por pago: importe de la operación, total pagado por el comprador (incluye intereses), neto acreditado, cargos y cuotas. El anticipo se acredita por el importe de la operación.
- Sin envío a domicilio en campañas v2: envío consolidado textil → club (dirección, responsable, transporte, referencia, fechas, costo y quién lo paga "a definir"), remito consolidado imprimible, recepción por el club, lista de distribución por comprador y jugador con saldo (Excel/CSV), registro de retiros. Retiro bloqueado con saldo al club pendiente salvo excepción con motivo.
- Acuerdo privado por club (exclusividad, fechas, línea de marca, muestras, catálogo, condiciones, compras iniciales, reglas de precio, contrato adjunto privado), alerta en el panel y aviso por correo una vez dentro de la ventana; vencimiento automático. Solo la línea de marca es pública.
- Muestrario: curvas superior/inferior con prenda de referencia, talles, cantidades, entrega, disponibilidad y lugar; equivalencia aprobada por producto; aviso público solo con equivalencia aprobada y curva disponible.
- Compras del club con funciones separadas (muestrario, compra inicial, respaldo), distribución de talles manual y aprobación; referencia de talles pedidos para el respaldo (solo informativa).
- Catálogo con estados (preparación, catálogo sin venta, preventa activa, preventa cerrada, archivado), familia y técnica como campos separados; los estados de preventa se actualizan al publicar y cerrar.
- Campañas: el club arma el borrador (productos, precio al socio, alcance por disciplina o categoría) y solicita activación; la textil autoriza por separado; con autorización, se publica. El alcance se valida en el servidor.
- Reglas por producto: categoría completa (categoría, cantidad esperada, confirmados, aprobación para abrir y aprobación excepcional para producir con menos) y compra inicial (mínimo editable y marcado estimado, compra vinculada comprometida, pagada, con talles y aprobada, o excepción aprobada). Nada se aprueba solo.
- Configurador guiado por pasos (talle, jugador, personalización, cantidad, resumen con total, anticipo y saldo), grupos de opciones con dependencias, obligatoriedad, límites y precios textil/club; editor en el panel. Validación en el servidor (un valor en un grupo que no corresponde se rechaza).
- Reporte de fabricación: prendas base consolidadas por modelo y talle y, aparte, trabajos de personalización (leyenda, nombre, número, adicionales) sin fragmentar el lote base.
- Política de cambios: se muestra en la ficha, al personalizar y antes de confirmar; el pedido guarda la versión aceptada; el panel distingue cambio voluntario, error de carga, error de la textil y falla (estos dos últimos con nota).
- Pedidos y campañas anteriores conservan su modelo (seña), precios y condiciones; no hay recálculo retroactivo.
- Piloto demostrativo "Rugby de Virreyes (demo)": escudo genérico, colores provisorios, remera de uso diario (con leyenda y nombre), short de verano, musculosa (precio final = textil), bolso (recargo 30 %), producto en "catálogo sin venta", compra inicial de 15, muestrario y acuerdo en borrador; banner de demostración en toda la tienda y pagos simulados.
- Borrador de propuesta comercial `docs/PROPUESTA-COMERCIAL.md`: excluido del repositorio (que es público) y entregado aparte; no publicado.

**Pendiente o fuera de alcance**

- Prueba con credenciales reales de Mercado Pago (incluida la conciliación de intereses y comisiones con pagos reales).
- Definiciones comerciales de la sección 4: quedan configurables y marcadas, sin comportamientos que comprometan cobros o promesas.
- Devoluciones a través de la API de Mercado Pago (se registran a mano), facturación electrónica e integración con transportes (Via Cargo se registra como texto).
- Firma electrónica del acuerdo (se adjunta el contrato firmado).
- Datos oficiales del club de Virreyes (nombre, escudo, colores, precios) y su aprobación antes de mostrar la demo como propia del club.
- La muestra HTML estática (`docs/muestra/`) es anterior y refleja el modelo de seña; la referencia vigente es la tienda demo.
