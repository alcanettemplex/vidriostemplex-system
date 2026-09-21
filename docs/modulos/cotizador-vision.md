# Cotizador — hacia dónde va

**Esto es DESTINO, no pendiente.** Nada de lo que hay aquí está autorizado a implementarse por
iniciativa propia. La decisión vigente sigue siendo la número 1 de
[`cotizador.md`](cotizador.md): *"port completo pero **aislado** del flujo del ERP"*. Este archivo
existe para que cualquier sesión —en la máquina de casa o en la del trabajo— sepa **para qué** se
está construyendo el módulo, y no para que lo conecte.

Regla práctica: si una tarea futura implica tocar `odp`, `leads`, `prospectos`, `sap` o
`catalogo_productos` desde el Cotizador, hace falta una orden explícita del usuario. Leer este
documento no es esa orden.

Conversación de origen: 2026-09-20. Todos los números de aquí están medidos contra la base real
ese mismo día.

---

## El problema que se quiere resolver

Hoy Vidrios Templex cotiza en **un Excel fuera del ERP**. Eso obliga a hacer cuatro veces el mismo
trabajo:

1. cotizar en el Excel,
2. dibujar el diseño y el plano **a mano**,
3. sacar el despiece del material **a mano**,
4. volver a teclear todo para crear la SAP.

Y como la cotización vive fuera del sistema, **no existe ninguna estadística comercial**: cuántas
cotizaciones se hicieron, cuántas se aprobaron, por qué monto, cuáles quedaron sin seguimiento,
quién las hizo. Nada de eso es hoy consultable.

---

## Los cinco destinos

1. **Cotizaciones por asesor**, ligadas a leads y prospectos.
2. **Toda ODP nace de una cotización.** La cotización deja de ser un papel suelto y pasa a ser el
   origen del trabajo.
3. **Ver la cotización desde donde se trabaja**: `ODPFichaModal` › tab **Comercial**, y también
   desde el lead y desde el prospecto.
4. **Al aprobar y crear la SAP, los ítems se traen solos** al modal *Solicitud de Accesorios y
   Perfilería*, ordenados, con su código, descripción, dimensión, cantidad y observaciones, y con
   la posibilidad de añadir a mano lo que falte.
5. **El plano técnico se carga solo** en `ODPFichaModal` › *Imprimir ODP* › subtab **Det. Técnico**.

Más el **PDF de la cotización** para enviar al cliente, que es lo que hace usable todo lo demás.

---

## Lo que ya encaja (medido el 2026-09-20)

No hay que inventar casi nada de estructura. Lo que existe:

| Destino | Lo que ya hay | Estado |
|---|---|---|
| Tab Comercial | `ODPFichaModal.tsx:95` ya tiene el tab, con badge `saps + cotizaciones` | ✅ existe |
| Ítems de la SAP | `sap_items` ya tiene `item` (A,B,C…), `codigo`, `descripcion`, `dimension`, `cantidad`, `und`, `observacion` | ✅ campo por campo |
| Códigos | `cotizador.producto.catalogo_producto_id` → `catalogo_productos`, **el mismo catálogo que ya busca el SAPModal** | ✅ puente hecho |
| Det. Técnico | `PrintableDetalleTecnico.tsx:68` reserva un recuadro de 700 px para `odp.croquis_url` | ✅ existe |
| Vidrio | paso 2 del `ODPForm` se llama **"Desglose Técnico"**; sus ítems ya traen `ancho_mm`, `alto_mm`, `cantidad`, `tipo_vidrio`, `color`, `espesor`, `pulidos`, `perforaciones` | ✅ encaja directo |

**Vinculación del catálogo al maestro** (`cotizador.producto`, 595 filas):

| Categoría | Total | Vinculados |
|---|---|---|
| ACCESORIO | 175 | **172** (98 %) |
| PERFILERIA | 363 | 304 (84 %) |
| VIDRIO | 40 | 39 |
| ACABADO | 17 | 15 |

Y 143 de los 163 diseños ya declaran sus accesorios (1.089 filas en `cotizador.diseno_accesorio`).

### El COTModal nunca se usó

`public.cotizacion` tiene **0 filas**. Se construyeron la tabla, el modelo, `COTModal.tsx` y
`cotizacionesSlice`, y jamás se guardó una sola cotización.

Consecuencia: **no hay convivencia que negociar.** El Cotizador nuevo ocupa ese lugar sin migrar
datos ni arrastrar dos numeraciones. El COTModal queda como código muerto — candidato a borrarse,
pero eso se decide aparte y no ahora.

### El asesor no ve márgenes, y no hay que hacer nada para conseguirlo

Cada línea del despiece usa `getPrecio(codigo, segmentoCliente)`
([`motorCalculo.ts:113`](../../backend-api/src/cotizador/lib/motorCalculo.ts)), que devuelve
`precio_pa` / `precio_pm` / `precio_pb` — **precios de venta**. El `costo_unitario` no entra nunca
al despiece.

Lo único que expone costos son las pestañas **Configuración** y **Calibración**. Basta con no
dárselas al asesor: no hace falta ningún "modo sin costos".

---

## El hueco real: la perfilería en la SAP

Es el primer bloque a atacar, y el problema **no es el orden de las piezas** como se supuso al
principio. Es el significado de dos columnas.

### Cómo se llena una SAP hoy, según el usuario

- **`CANT.`** = **perfiles completos** (barras).
- **`DIMENSION`** = **los cortes**, escritos a mano. `4-400` significa *4 cortes de 400 mm*. Varias
  medidas se separan con `/`:

  ```
  4-400/ 2-1000/ 2-1900
  ```

### Lo que dicen los datos reales (1.940 `sap_items`, 365 SAP)

- `dimension` está lleno en **680** filas; vacío en el resto.
- De esas 680: **337** siguen el formato `cantidad-medida` que describe el usuario, **139** usan el
  formato **invertido** `medida = cantidad` (`1500 = 1 / 750 = 1`), y **116** llevan varias medidas
  en una celda con separadores que varían entre `/`, `//` y espacios.
- Algunas filas son **vidrio**, no perfil, y usan `X` o `*`: `1300 X 1700 = 1`, `1-488 * 466`.
- `und` está vacío en **1.934 de 1.940** filas: el campo existe y nadie lo usa.
- Las filas con el formato `= cantidad` suelen traer `cantidad = 0.00`, o sea que en esos casos
  **`CANT.` se deja vacío**.

**Conclusión para quien implemente:** el generador debe **emitir** la convención `4-400/ 2-1000`
(la mayoritaria y la que el usuario declara correcta). No intentar **parsear** el histórico: hay al
menos tres convenciones conviviendo y dos de ellas son de vidrio.

### El dato que falta y bloquea todo

Para llenar `CANT.` hace falta saber **cuánto mide una barra comercial de cada perfil**, y ese dato
**no existe en ninguna tabla del sistema**. Se buscó por nombre de columna (`largo`, `barra`,
`longitud`) en los esquemas `public` y `cotizador`: **cero resultados**.

Lo que hay hoy:
- La perfilería del Cotizador se cotiza **`X METRO`** (358 de 363 productos; 5 en `UND`). El motor
  cobra metros lineales, **no barras**.
- `cotizador.diseno_perfil.desperdicio_pct` vale **5 en los 1.205 perfiles**: es un valor por
  defecto uniforme, no una medición por perfil.

Así que el Cotizador sabe los cortes (`resultado.cortes.perfiles[]` trae `ref`, `descripcion`,
`medidaMm`, `cantidad`) pero **no puede decir cuántas barras pedir**, porque no sabe cuánto mide
una barra. Convertir cortes → barras es además un problema de empaquetado real: los cortes no se
parten entre dos barras.

> ⚠️ **Discrepancia que hay que resolver con el negocio, no con código:** la cotización cobra
> metros consumidos + 5 % de desperdicio, pero la SAP pide **barras enteras**. Si un producto
> necesita 11,4 m y se piden 2 barras de 6 m (12 m), alguien está absorbiendo la diferencia. Hoy
> ese desajuste lo tapa el asesor a ojo. Automatizarlo lo va a hacer visible.

### El color ya está resuelto (no volver a preguntarlo)

Los **1.205 de 1.205** perfiles de diseño traen `codigos_por_color`, con seis colores: `MATE`,
`CRUDO`, `NEGRO`, `BLANCO`, `BRONCE`, `GRISPLATA`. Ejemplo real, ref `173` "Sillar Cabezal":

```json
{ "MATE": "SIL0102", "CRUDO": "SIL0301", "NEGRO": "SIL0606",
  "BLANCO": "SIL0415", "BRONCE": "SIL0504", "GRISPLATA": "SIL0203" }
```

El código del perfil **ya codifica tipo y color a la vez**, igual que en las SAP reales
(`CAB0601` = *7038 CABEZAL 700 NEGRO*). El Cotizador ya emite el código correcto según el color
elegido; no hay nada que diseñar aquí.

---

## Preguntas al maestro del taller — respondidas el 2026-09-21

1. **¿Cuánto mide la barra comercial de cada perfil?** **Siempre 6 m, para cualquier perfil.** No
   varía por referencia.
2. **¿Cómo se decide cuántas barras pedir?** **No hay que empaquetar (bin packing).** El usuario lo
   calificó como "lo de menos": basta con la columna DIMENSION con los cortes; el retal sobrante lo
   gestiona él mismo, ingresándolo a inventario. `CANT.` es una estimación redondeada hacia arriba,
   no una optimización de corte.
3. **¿El 5 % de desperdicio es real?** Sí, confirmado — se aplica siempre.
4. **Las letras A, B, C…** siguen **el orden en que el asesor las ingresa**, no una heurística de
   geometría. ⚠️ No confundir con [`ordenCorte.ts`](../../backend-api/src/cotizador/lib/ordenCorte.ts):
   ese archivo ordena las PIEZAS dentro de un despiece para la Orden de Corte (otro documento, otro
   problema) y **sigue sin confirmar con el taller** — esta respuesta no lo resuelve ni lo toca.
5. **Perfiles que el proveedor entrega ya cortados:** queda **a criterio del asesor**, sin
   distinción especial en el sistema.
6. **¿Qué mira primero al recibir una SAP?** Nada en particular — "en la SAP está todo (accesorios y
   perfiles), no hay algo que diga qué miro primero o qué me falta".

Con esto se construyó el generador aislado — ver `docs/modulos/cotizador.md` →
"Generador de perfilería para SAP". Sigue **sin conectar** a `SAPModal` ni a `ODP`: falta el vínculo
Cotización↔ODP (sección "Identidad" más abajo) para saber qué cotización alimenta qué SAP.

---

## Decisiones cerradas en la conversación del 2026-09-20

1. **El aislamiento sigue vigente.** Nada se conecta al flujo sin orden explícita.
2. **El Cotizador nuevo sustituye al COTModal**, que nunca se usó (0 filas). Sin migración.
3. **La SAP trae perfilería y accesorios.** El vidrio no: sigue manual.
4. **El vidrio se lleva al paso "Desglose Técnico" del `ODPForm`** con las medidas del despiece
   precargadas, para que el asesor las verifique o edite. De ahí sale solo el PedidoPV.
5. **Planos: 4 por hoja, paginados.** Una ODP puede tener de 1 a 30 productos, así que la hoja de
   Det. Técnico se pagina en lugar de intentar meterlos todos.
6. **El asesor ve el precio al cliente** (con margen, IVA y AIU incorporados), nunca el costo.
7. **Aprueban:** el asesor que creó la cotización, `admin` y `root`.
8. **Estadísticas:** módulo **Dashboard**, tab **Cotizaciones**. ⚠️ El Dashboard **no tiene
   pestañas hoy** (`DashboardHome.tsx` son 36 líneas que enrutan por rol): hay que crear la
   estructura de tabs primero.
9. **Aprobación del cliente, en dos tiempos:**
   - **Ahora:** PDF que se envía por WhatsApp. El asesor marca `APROBADA` en el sistema.
   - **Después:** enlace público donde el cliente ve, aprueba o rechaza. Queda expuesto a internet,
     así que **las medidas de seguridad tienen que ser óptimas** — requisito explícito del usuario.
     Implica token con caducidad, endpoint sin sesión, límite de intentos y registro de quién
     aprobó, cuándo y desde dónde. No se empieza hasta que la vía del PDF funcione.

---

## Lo que sigue abierto

- Qué pasa con las **cuatro vías por las que hoy nace una ODP** (`createODP` directo,
  `crearODPDesdeLead`, `aprobarProspecto`, No Conformidad) cuando la cotización sea obligatoria.
  Y con las ODP tipo **OA**, que van sin IVA.
- Cómo se **renderiza el plano a imagen**: el Cotizador entrega geometría
  (`{ escala, confianza, exterior, paneles[], cotas[] }`), no un PNG. `croquis_url` es una URL de
  Cloudinary. Falta decidir el renderizador y qué hacer con los planos de `confianza: 'nula'`, que
  son esquemas sin escala y no deberían llegar al taller como plano técnico.
- **Identidad**: `cotizador.cotizacion.asesor` es `STRING(80)` y el cliente son cuatro campos de
  texto. Sin `cliente_id` ni `asesor_usuario_id` no hay estadística por asesor ni ODP automática.
  Es aditivo y no rompe nada, pero es la pieza base de los destinos 1, 2 y 6.

---

## Orden sugerido (no autorizado todavía)

1. ~~**Perfilería en la SAP**~~ — el generador (cálculo puro CANT./DIMENSION) se construyó el
   2026-09-21, ver `docs/modulos/cotizador.md`. **Sigue pendiente** conectarlo: hace falta el
   vínculo Cotización↔ODP (punto 3) y el botón en `SAPModal` que lo invoque.
2. ~~**PDF de la cotización**~~ y ~~**Hoja de Trabajo**~~ — ambos construidos el 2026-09-21, ver
   `docs/modulos/cotizador.md`.
3. **Identidad** (`cliente_id`, `asesor_usuario_id`) — barata, aditiva, y base de todo lo demás
   (incluida la conexión de perfilería del punto 1).
4. Estadísticas, tab Comercial, planos, ODP desde cotización.
