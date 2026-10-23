# Módulo Detalles Técnicos

Editor de **planos de vidrio templado** para los pedidos a VITELSA / TEMPLACOL. Reemplaza el Excel
`1.1 DETALLES TECNICOS.xlsx` (60 hojas dibujadas a mano con bordes de celda): cada plano es una
**plantilla paramétrica** —contorno, esquinas (despunte, radio, muesca), perforaciones, medias
perforaciones, boquetes,
chaflanes y notas— que se dibuja a escala con cotas automáticas, se valida contra reglas de temple y
sale en el formato **FOR-005** (una hoja «PLANO X» por plano).

> **Estado (2026-10-16): integrado con Pedidos PV.** Antes (2026-09-27) era un módulo aislado, solo
> admin, con el pedido en `localStorage`. Desde el 2026-10-16 tiene **dos modos**:
>
> - **Modo pedido** — `/detalles-tecnicos/:pedidoId`, se abre con **«Diseñar»** en Pedidos PV →
>   Gestión PV. Encabezado y vidrios salen del Pedido PV y su ODP; **un plano por letra DT**;
>   guardado en la BD con la imagen en Cloudinary; el Excel es el **formulario oficial del
>   proveedor + las hojas «PLANO X»**.
> - **Modo libre** — `/detalles-tecnicos` desde el menú, **solo admin**: un pedido de práctica que
>   vive en el navegador, para organizar planos sin ODP (decisión del usuario, 2026-10-16).

---

## Flujo del modo pedido

1. Una ODP con vidrio templado genera su Pedido PV → aparece en **Por Gestionar**.
2. **Asignar ítems**: se marcan los vidrios del pedido y se escribe la **letra DT** (A, B, C…). Los no
   marcados pasan a Compras (lógica de siempre). El modal **precarga** la letra y la observación que
   ya tiene cada ítem (antes arrancaba vacío y al guardar las borraba — bug H3, cerrado).
3. En **Gestión PV**, la fila muestra el chip **«DT 1/2»** (letras con plano / letras del pedido) y
   la acción **«Diseñar»**, solo si algún ítem tiene letra y el usuario puede diseñar.
4. El editor muestra las letras con sus vidrios; cada letra se diseña desde una plantilla. El dibujo
   usa la medida del **primer vidrio** de la letra; cada vidrio sale con su propia medida en la tabla.
5. **Guardar** sube la imagen, guarda el plano y **actualiza PERF y BOQ de los vidrios de esa letra**
   con lo dibujado (decisión C del usuario: el formulario y el plano no se contradicen).
6. **Descargar Excel** (desde el editor o desde Acciones en Gestión PV) y **Imprimir pedido** sacan
   el formulario del proveedor seguido de las hojas FOR-005.

## Decisiones del usuario (2026-10-16)

| # | Decisión |
|---|---|
| 1 | Una letra DT = un plano. Acota los herrajes; ancho × alto de cada vidrio va en su fila. |
| 2 | La letra se escribe en «Asignar ítems» y además se asigna o cambia desde el editor. |
| 3 | Un solo Excel: formulario oficial + hojas «PLANO X». Con extensiones (6733, 6733-1) **cada archivo lleva solo los planos de las letras de sus propios ítems**. Sin hoja RESUMEN (el formulario ya lista los vidrios). |
| 4 | Diseñan **admin** (y root) y los usuarios con **`puede_gestionar_pv`**. |
| 5 | **Bloqueado desde ENVIADO**; solo admin desbloquea, y queda abierto **hasta que admin lo vuelva a bloquear**. |
| 6 | «Diseñar» aparece solo si algún ítem del pedido tiene letra DT. |
| 7 | Desde Pedidos PV se abre el modo pedido; el menú conserva el modo libre para admin. |
| 8 | Imagen del plano en **Cloudinary** (carpeta `templex_detalles_tecnicos`). |
| 9 | Encabezado FOR-005: **número del Pedido PV, # ODP e iniciales del asesor**. La «OBRA» es la misma del formulario oficial (`ODP — iniciales`): el nombre del cliente final no viaja al proveedor. |
| A | Una letra sin plano **no bloquea la descarga**: el editor avisa y descarga igual. |
| D | «Imprimir pedido» lleva los planos en el mismo formato del Excel. |

## Dónde vive

### Base de datos
- **`pedido_pv_plano`** (`PedidoPVPlano`) — un plano por `(pedido_pv_id, letra)` UNIQUE, colgado del
  **pedido principal** (`sufijo IS NULL`): las extensiones `-1, -2` se borran y recrean en cada
  `asignarItems`. Campos: `pieza` (JSONB, el dibujo) + `esquema` (versión del formato), `conteos`
  (JSONB: PERF, BOQ, DSP, radios, chaflán, m² — calculados en el navegador para que el servidor no
  duplique la geometría), `imagen_url`/`imagen_public_id`/`imagen_ancho`/`imagen_alto`,
  `actualizado_en` (también control de concurrencia: guardar sobre una versión vieja da 409).
  FK a `pedido_pv` con `ON DELETE CASCADE`.
- **`pedido_pv_dt_desbloqueo`** (`PedidoPVDtDesbloqueo`) — PK `pedido_pv_id` (principal),
  `desbloqueado_por`, `desbloqueado_en`. Una fila = desbloqueado. **Tabla propia a propósito**: un
  modelo `PedidoPV` con columnas que la BD aún no tiene haría fallar todas las consultas de Pedidos
  PV hasta correr el ALTER; tablas nuevas las crea `sync` al arrancar.
- Las dos tablas **no tienen script**: las crea `sequelize.sync({ alter: false })` al arrancar el
  backend (con FK e índice único, declarados en el modelo).
- **Auditoría**: ambas en `MODELOS_AUDITADOS`, **no** en `TABLAS_AUDITABLES` (no revertibles desde
  ROOT): el plano borra su imagen anterior de Cloudinary al reemplazarla, y el desbloqueo tiene PK
  `pedido_pv_id` mientras el revertir arma su `WHERE id = …`.
- `odp_items.dt` sigue siendo la letra (STRING 100, texto libre). Desde el 2026-10-16 se guarda
  **normalizada** (mayúscula, sin espacios) tanto en `asignarItems` como desde el editor.

### Backend
- `controllers/detalle_tecnico.controller.ts` → `/api/detalle-tecnico`:
  - `GET /pedido/:id` — resuelve el grupo (acepta el id del principal o de una extensión): encabezado,
    pedidos del grupo, ítems con su letra y si están bloqueados, planos, letras bloqueadas, desbloqueo,
    `puede_editar`, `puede_desbloquear`. Lectura abierta a quien ve Pedidos PV (lo usa el imprimible).
  - `PUT /pedido/:id/plano/:letra` — Zod `.strict()` del dibujo completo; sube el PNG (data URL) a
    Cloudinary **antes** de la transacción y lo borra si la BD falla; en la transacción guarda el plano
    y hace `ODPItem.update({ perforaciones, boquetes })` con `individualHooks` (auditoría); la imagen
    anterior se borra después del commit.
  - `DELETE /pedido/:id/plano/:letra` — no toca PERF/BOQ.
  - `PATCH /pedido/:id/letras` — cambia letras **sin** pasar por `asignarItems` (que recrea extensiones).
  - `PATCH /pedido/:id/bloqueo` — solo admin/root.
  - Socket: `emitirCambio('pedidos_pv')` con `import('../server')` **dinámico** (ciclo de imports).
- `utils/detalleTecnico.ts` — reglas compartidas, **fuera de los controladores** por el ciclo
  `server → app → routes → pedido_pv.controller`: `normalizarLetra`, `puedeDisenarDT`,
  `grupoDePedido`, `letrasBloqueadas`, `letrasConPlanoPorPedido` (chip DT del listado, 2 consultas
  livianas por página sin traer el JSONB) y `agregarPlanosAlExcel` / `hojaPlano` (la hoja FOR-005).
- `pedido_pv.controller.ts`:
  - `getPedidosPV` agrega `dt_planos` a cada fila.
  - `generarExcelPedidoPV` llama a `agregarPlanosAlExcel` después de llenar la plantilla.
  - `asignarItems` normaliza la letra.
- Logo del FOR-005 en el servidor: `backend-api/templates/logotemplex.png` (copia del de
  `frontend-web/public/assets/images/`; el Dockerfile ya copia `templates/`).

### Frontend — `frontend-web/src/features/detalles-tecnicos/`
- `DetallesTecnicosPage.tsx` — elige el modo por la URL; contiene el **modo libre** (`ModoLibre`).
- `modoPedido/` — `DisenoPedidoPage.tsx` (la página), `useDisenoPedido.ts` (carga, cambios sin
  guardar por firma, guardar con PNG, 409), `PanelLetras.tsx` (letras + vidrios con letra editable),
  `HojasPedido.tsx` (hojas FOR-005 de un pedido: la usan el editor **y** «Imprimir pedido» de
  Gestión PV), `planos.ts` (conversión BD ↔ editor), `api.ts`.
- `estado.ts` — `useHistorial<T>` (deshacer/rehacer genérico, compartido por los dos modos),
  `usePlanos`, y `usePedido` del modo libre.
- `useAtajos.ts` — Ctrl+Z/Y, flechas, Supr, Escape; **no actúa dentro de campos ni de Select/menús de MUI**.
- `components/HojaDetalle.tsx` — la hoja FOR-005; recibe `encabezado` y `filas` (una por vidrio).
  `ESTILOS_HOJA_IMPRESA`: altura fija y salto de página por hoja (el `aspect-ratio` de pantalla
  desbordaba la carta y dejaba una hoja en blanco).
- `exportar/imagen.ts` — `planoAPng` y `encajar` (área del dibujo: **debe coincidir** con la de
  `utils/detalleTecnico.ts`). `exportar/excel.ts` — Excel del **modo libre** (con hoja RESUMEN: ahí no
  hay formulario oficial).
- Ruta: `/detalles-tecnicos` con `rolesDeRuta('/detalles-tecnicos')` (admin) y
  `/detalles-tecnicos/:pedidoId` con `rolesDeRuta('/pedidos-pv')`. La página exige además admin o
  `puede_gestionar_pv` para editar; los demás roles de Pedidos PV lo ven en solo lectura.
- Pedidos PV (`PedidosPVPage.tsx`): acción «Diseñar» en `AccionesMenu`, chip «DT x/y» en la columna
  Pedido, precarga del modal Asignar ítems, «Imprimir pedido» con `HojasPedido` detrás del formulario.

## Reglas

- **Bloqueo por letra, no por pedido**: una letra se bloquea si **alguno de sus vidrios** va en un
  pedido (principal o extensión) en estado ≠ PENDIENTE, salvo desbloqueo de admin. Si solo se envió
  el 6733, la letra que vive solo en el 6733-1 sigue editable. Cambiar la letra de un vidrio de un
  pedido enviado también exige el desbloqueo.
- **Medidas**: el dibujo usa la medida del primer vidrio de la letra. Si la ODP cambia esa medida, el
  plano se **reescala solo** al abrir (los herrajes se miden desde los bordes) y queda como cambio sin
  guardar. Avisos en el editor: vidrios de la misma letra con medidas distintas, y dibujo cuya caja no
  coincide con el vidrio (desplome).
- **Descargar** se deshabilita con cambios sin guardar (el Excel sale de lo guardado). Antes de
  descargar se avisa de letras sin plano y planos con errores; se descarga igual.
- **Salir con cambios sin guardar**: `useBlocker` + `beforeunload`.
- Un plano que se queda sin vidrios (se les cambió la letra) **no se borra solo**: aparece como
  «Sin vidrios con esta letra» y se quita a mano.
- **Esquina a 90° en desplomes** (2026-10-16): el plano marca con el símbolo de ángulo recto + «90°»
  **solo la(s) esquina(s) inferior(es)** a escuadra (decisión del usuario): desplome lateral → la del
  lado vertical; descuadre superior → las dos de abajo; rectangular → ninguna. El cuadrito va por
  dentro, en el cruce de los lados rectos (aunque la esquina tenga despunte o radio); el texto, por
  fuera en diagonal (por dentro chocaba con la etiqueta de la muesca de piso). `esquinas90Inferiores()`
  en `PlanoSVG.tsx`. En el editor el selector dice «El lado a 90° (a escuadra) es el…» y guarda el
  lado inclinado (el opuesto): el formato de `pieza` no cambió. Un plano guardado antes conserva su
  imagen sin la marca hasta que se vuelva a guardar.
- ANCHO/ALTO impresos y m² usan **una sola regla**: la caja envolvente (`medidasCaja`). Antes un
  desplome que abre arriba imprimía 600 y calculaba el m² con 630.
- **Cotas ANCHO / ALTO con palabra** (2026-10-17, decisión del usuario): si los vidrios de la letra
  miden distinto en un eje, la cota general de ese eje dice `ANCHO` o `ALTO` en vez del número del
  primer vidrio; cada eje por separado. Cotas de herrajes y la segunda cota de un desplome siguen
  con número; la tabla de la hoja conserva la medida de cada vidrio; el modo libre no cambia.
  - Regla única `rotulosDeLetra()` en `modoPedido/planos.ts`, sobre **todos** los vidrios de la letra
    en el grupo (principal + extensiones): hay una sola imagen por letra.
  - Se guarda en la pieza como `rotulos?: { ancho, alto }` (opcional en el Zod de `piezaSchema`, sin
    subir `ESQUEMA_PIEZA`): el Excel usa la imagen de Cloudinary, no redibuja, así que lo que muestra
    la imagen tiene que quedar registrado para detectar cuándo cambia.
  - `useDisenoPedido` los **recalcula en vivo** (`planoConRotulos`) y, si difieren de lo guardado,
    el plano queda «Sin guardar». **Excepto** letras bloqueadas y usuarios de solo lectura: no pueden
    guardar, y un pendiente sin resolver deshabilita «Descargar Excel» de todo el pedido.
  - `firmaPlano` compara los rótulos como texto fijo (`A-`, `-H`…) y no por `JSON.stringify`: el
    JSONB de Postgres reordena las claves y el plano recién leído nunca coincidiría.
  - `planoDeDT` deja los rótulos como se guardaron: «Imprimir pedido» desde Gestión PV sale igual
    que la imagen del Excel.
  - Planos guardados antes del cambio con vidrios de medidas distintas: el Excel conserva el número
    hasta que alguien abre el editor y guarda (aparecen como «Sin guardar»).
- **Un plano sirve para todos los vidrios de su letra aunque midan distinto** (2026-10-17, el
  propósito de la regla anterior). La pieza llevada a otra medida con `piezaConMedidas` (la misma
  del reescalado) es el plano de ese vidrio, porque los herrajes se miden desde los bordes o el centro.
  - **Validación por medida** — `validarLetra(plano, vidrios)` en `modoPedido/planos.ts`: valida el
    dibujo y además cada **otra** medida de la letra (con el espesor de ese vidrio); agrega los
    avisos nuevos con «En el vidrio de 700 × 1800: …». Se usa en el editor (`EditorPlano` prop
    `validar`), en el diálogo de medidas (`DialogoMedidas` prop `validar`), en el ícono de error del
    panel de letras y en el aviso previo a «Descargar Excel». El modo libre sigue con `validarPlano`.
    ⚠️ `piezaConMedidas` clona con **ids nuevos** (mismo orden): `validarLetra` devuelve el `opId`
    original por posición; sin eso, un clic en el aviso no seleccionaba nada.
  - **Chaflán por fila** — en pantalla e impresión, `filasDe(items, pieza)` calcula los metros de
    cada vidrio con su medida (`FilaVidrio.chaflanMl`). El Excel del servidor no tiene geometría:
    al guardar, `conteos.chaflanPorMedida` lleva `{"700x1800": 0.7, …}` (opcional en el Zod, claves
    `^\d+x\d+$`, máx. 200) y `hojaPlano` lo busca fila por fila; una medida que no está usa
    `chaflanMl` (el del dibujo), como antes. Si las medidas de una letra con chaflán cambian, el
    plano queda «Sin guardar» (`firmaPlano(p, chaflan)` compara solo las medidas distintas de la del
    dibujo, así un plano viejo de una sola medida no se marca), salvo letra bloqueada o solo lectura.
  - La segunda cota de un desplome **sigue con el número del primer vidrio** (decisión del usuario).
- **Desplome lateral: la medida del pedido es el ancho MAYOR** (2026-10-17). La hoja del pedido
  lleva el ancho mayor; antes el editor la ponía siempre en el **ancho de abajo** (bloqueado), así
  que un «abre arriba» de 1150 quedaba con 1150 abajo y 1180 arriba, imprimía ANCHO 1180 y no
  había forma de corregirlo.
  - `medidaPedido(pieza)` en `modelo/plantillas.ts` = `max(ancho, anchoSup)` × `alto`. Reemplaza a
    `pieza.ancho` en toda comparación con el pedido (`planoDeDT`, `piezaParaMedida`, claves de
    medida, firma). `piezaConMedidas(p, W, H)` pone W en el lado mayor y conserva la diferencia.
  - Editor, modo pedido: selector **«Más ancho: abajo / arriba»** (intercambia los dos anchos; los
    herrajes se miden desde los bordes y no se mueven); el lado mayor queda «Del pedido» y el menor
    se escribe, topado a la medida del pedido («Máx. 1150»). Resumen de la sección = `medidaPedido`.
  - Cota del plano con rótulos: la palabra **ANCHO** va en la cota del lado mayor (arriba en un
    «abre arriba»); la otra conserva su número.
  - Modo libre: el «Ancho» del diálogo de medidas también es el ancho mayor.
  - El **descuadre del borde superior no cambió** (decisión del usuario): `alto` sigue siendo el del
    pedido aunque `altoLado` sea mayor.
  - Planos «abre arriba» guardados antes (1150 abajo, 1180 arriba) se corrigen solos al abrir y
    quedan «Sin guardar».
- **Una letra bloqueada o un usuario de solo lectura no reescala el plano al abrirlo**
  (`planoDeDT(…, soloLectura)`, 2026-10-17). Antes, si la ODP cambiaba la medida del primer vidrio
  de una letra ya enviada, el plano quedaba «Sin guardar» sin poder guardarse y eso deshabilitaba
  «Descargar Excel» del pedido. «Imprimir pedido» de Gestión PV imprime la letra enviada tal como
  la tiene el proveedor.

## Validaciones (`modelo/validaciones.ts › REGLAS`)

De referencia de la industria; **avisan, no bloquean**, hasta confirmarlas con VITELSA.
- La holgura de una perforación se mide contra el **contorno real** (muescas, despuntes, boquetes y
  desplomes incluidos). Una perforación dentro de un recorte es error.
- **Herrajes estándar exentos** (perforaciones con `grupo`: bisagras, rodamientos, Glassvit…): sin
  aviso de distancia al borde, de diámetro menor que el espesor, ni de distancia entre perforaciones
  del mismo herraje. Salirse del vidrio o montarse sigue siendo error. Con esto las 60 plantillas
  dan **0 avisos con espesor 8** (antes 7 plantillas avisaban sobre sí mismas, entre ellas las 4
  corredizas). La plantilla «Deslizante» agrupa sus dos Ø6 como herraje.
- Boquetes que se traslapan en el mismo borde → error. Boquete que invade el corte de una esquina →
  error. Espesor ilegible → aviso explícito (antes apagaba en silencio las distancias).
- El diálogo de medidas muestra los errores **antes** de crear el plano (p. ej. un botón a 1000 mm en
  una hoja de 600).

## Media perforación (2026-10-19)

Proceso `media-perforacion` (`modelo/tipos.ts`): semicírculo abierto al canto con el **centro exactamente
sobre el canto**. Campos `borde`, `pos`, `desde` (`inicio|fin`, como el boquete) y `d`. **`pos` se mide
del extremo del canto al centro** (decisión del usuario), no al inicio como en el boquete.
- Es parte del **contorno** (`contornoDe`: vértice con `arco` = radio; `pathDe` lo dibuja con `A … 0 0 0`,
  barrido hacia adentro). Por eso las perforaciones cercanas se validan contra él sin código extra, y
  funciona en cantos inclinados de desplome.
- **Cuenta como PERF** (`conteosDe`): Excel, hoja FOR-005, galería y la actualización de PERF del vidrio
  al guardar la toman sin cambios.
- Validaciones (todas **aviso**, ninguna impide diseñar — decisión del usuario): falta Ø, se sale del
  canto, se mete en el corte de una esquina, a menos de 2× espesor de la esquina, Ø menor que el
  espesor, encima de un boquete, encima de / a menos de 2× espesor de otra media perforación del canto.
- Arrastre: se desliza por el canto y salta al canto más cercano; en grupo se queda en su canto.
- Dibujo: cruz de centro, etiqueta «½ PERF. Ø14 mm», cota del extremo al centro.
- Backend: rama nueva en el `discriminatedUnion` Zod de `detalle_tecnico.controller.ts`. Ninguna plantilla
  ni herraje la usa todavía.

## Modo libre (solo admin)

- Pedido en `localStorage` (clave `erp-detalles-tecnicos-v1`, formato `{ version: 2, pedido }`; lee
  también el formato anterior). **Lectura defensiva**: si el JSON está dañado, guarda una copia en
  `…:danado`, arranca vacío y avisa (antes dejaba la página en blanco).
- Guardado con espera de 400 ms (antes escribía en cada cuadro de un arrastre) y al salir/cerrar.
- Otra pestaña con el mismo pedido: se carga la versión más nueva y se avisa (antes se pisaban).
- «Empezar un pedido vacío» y «Cargar el pedido de ejemplo» son opciones separadas. Antes de exportar
  se avisa si falta número u ODP, si quedan datos del ejemplo o si hay planos con errores.
- Fecha por defecto: `hoyBogotaISO()`.

## Pendiente / por confirmar

- **Reglas de temple** con VITELSA/TEMPLACOL (umbrales de `REGLAS`).
- **BOQ cuenta las muescas de esquina** (convención heredada del prototipo; decisión D3 abierta). Como
  ahora BOQ se escribe en `odp_items.boquetes` al guardar, conviene confirmarlo.
- **Columna DES (`descuentos`)** no se toca: tiene textos libres («SI», «DESCUADRADO»).
- **Datos reales (2026-09-27):** 368 ítems con `odp_items.dt` en ~300 ODP, **ninguno con plano**:
  «DT sin plano» es el caso normal del histórico.
- El **renderizador de plano → imagen** quedó resuelto aquí (el navegador genera el PNG al guardar).
  El Cotizador tiene la misma necesidad (`cotizador-vision.md`): puede reutilizar este camino.
- Los componentes siguen en MUI; re-maquetar al sistema «Cristal y Aluminio» sigue pendiente.

## Boquete con alivios (2026-10-20)

Campo opcional `Boquete.alivio = { d, fondo }`: un círculo de Ø `d` a cada lado del boquete, con el centro **sobre el lado** del boquete a `fondo − d/2` del canto; `fondo` es la distancia del canto al **punto más profundo** del alivio (decisión del usuario, leída del plano del taller: boquete 60 × 38, alivio Ø16 hasta 40).
- Geometría en `geometriaAlivios` (`modelo/geometria.ts`): devuelve el tramo del contorno que reemplaza al boquete, o un problema. Si `fondo ≤ prof`, cada arco vuelve al mismo lado del boquete; si `fondo > prof`, termina sobre el fondo. Usa el vértice de arco general `Vert.circ` (centro, radio, sentido), que también usa el contorno en arco.
- **Son parte del boquete, no cuentan como PERF** (BOQ no cambia). Con alivios no se usa `radio`.
- Avisos (no bloquean): faltan medidas, cortan el canto (`fondo < d`), no tocan el boquete, los dos alivios se juntan en el fondo. En esos casos el plano se dibuja **sin alivios** y el aviso lo dice.
- El traslape entre boquetes, el corte de esquina y la exención «tipo ojo» de perforaciones cuentan lo que los alivios se abren a los lados.

## Contorno en arco (2026-10-20)

`Contorno { tipo: 'arco', lado }`: el canto `lado` completo es un **semicírculo de radio = la mitad de ese canto**. Si el lado recto mide exactamente el radio, el vidrio es un semicírculo (935 × 1870); si mide más, es un rectángulo con remate en arco (ventana o puerta en arco); si mide menos, **error** («el arco no cabe»).
- Sin parámetros propios: `piezaConMedidas` lo reescala solo y una letra con vidrios de medidas distintas sigue siendo válida.
- `verticesBase` sigue siendo el rectángulo envolvente: cotas, m² y `limitesDe` usan la caja. Las perforaciones referidas al lado curvo se miden desde la línea que toca el arco. **El m² es el del rectángulo**, no el área del semicírculo.
- `esquinasDe(p)` anula las dos esquinas del canto curvo (las reemplaza el arco); el editor las deshabilita y al elegir el arco las deja rectas. Toda lectura geométrica de esquinas pasa por `esquinasDe`, no por `p.esquinas`.
- **RADIOS = 1** por el arco (decisión del usuario). Un chaflán en el canto curvo mide π·r y se dibuja siguiendo la curva.
- Errores: boquete o media perforación en el canto curvo; boquete en un canto vecino que se mete en el tramo que ocupa el arco (`recorteEnBorde` le da al vecino el radio del arco en ese extremo). El arrastre nunca salta al canto curvo.
- Dibujo: línea de radio a 45° con «R 935». Las marcas de 90° de los desplomes no aplican.
- Fuera de alcance: arco rebajado (flecha menor que el radio) y arcos en dos cantos.

**Plantillas nuevas** (sin hoja en el Excel, la galería las muestra como «Nueva»): «Puerta con boquetes de alivio» (Puertas) y «Semicírculo» (Formas y perforaciones). Con ellas el catálogo tiene **62** y sigue con 0 avisos con espesor 8.

## Optiglass y limpieza de cotas (2026-10-22)

- **Familia propia «Optiglass»** en la galería (antes dentro de Puertas). Las cuatro usan `kitOptiglass()` (`modelo/constructores.ts`): 2 perf. Ø23 a 85 de cada canto y 21 de arriba + ranura de 12 al borde, **agrupadas como un herraje** (se arrastran y se borran juntas).
- **Plantilla nueva «Optiglass · manija Roma + cerradura Picoloro»** (`optiglass-roma-picoloro`, del plano del taller, 900 × 2140): kit + boquete Picoloro 150 × 35 de **esquinas rectas centrado a 1000 del piso** (`BQ('der', 925, 'fin', …)`: la cota del plano marca 925, el borde inferior del boquete) + `manijaRoma()`: 2 perf. Ø14 a 85 del canto, a 800 y 1200. Decisiones del usuario: centrado a 1000, rectas, y agregar plantilla nueva en vez de reemplazar.
- «Optiglass 1» conserva la geometría de su hoja del Excel (cerradura R15 a 1000, una sola Ø14): solo se agrupó el kit. Las plantillas no tocan planos ya guardados (cada plano guarda su copia).
- Catálogo: **63** plantillas, 0 avisos con espesor 8, también con el ancho + 120 mm.
- **Cotas (`PlanoSVG.tsx`), para todas las plantillas:**
  - La cota de posición de un boquete en un canto lateral que ya tiene cadena de cotas de perforaciones va **una línea más afuera** (`carrilPerf` + 1,2 f, con líneas auxiliares). Antes iban a 1,3 f y 1,4 f y se leían pegadas («800 1000»).
  - **Ranura tipo «ojo»** (boquete que toca una perforación): se acota solo su ancho, sin etiqueta «BOQ» ni cota al borde de la ranura (el «79» tapaba el «85» de la perforación). Sigue contando como BOQ.
  - La etiqueta «N PERF. Øx» esquiva la de los boquetes (abajo → arriba → más abajo).
- Verificado dibujando con el `PlanoSVG` real fuera del navegador (sucrase + `renderToStaticMarkup` + Edge headless). Sin cambios en backend ni BD: el Excel usa la imagen guardada, así que **los planos ya guardados conservan el dibujo viejo hasta que se vuelvan a guardar**.
- ~~«Puerta flauta acero» amontona las cotas de sus 3 perforaciones Ø16 por esquina~~: resuelto el 2026-10-23 (una sola cota por columna).

## Muescas de puerta corregidas y manija Roma 40 (2026-10-23)

- **Muescas de esquina invertidas** (reporte del usuario con el plano del taller): `mue(a, b)` pone `a` sobre el borde superior/inferior y `b` sobre el canto lateral, y las plantillas de puerta las tenían al revés (35 a lo ancho × 150 a lo alto). Corregidas **todas las aplicables** (decisión del usuario): «Puerta esquina redonda» y «Puerta batiente Júpiter» 35×150 → **150×35**; «Puerta esquina + perf. A/B» 35×110 → **110×35**; «Batiente esquinero con botón» 25×75 → **75×25**. No se tocaron «Boquete de esquina 300×300» ni «Boquete de esquina inferior» (cortes genéricos, no muescas de herraje).
- **Plantilla nueva «Puerta esquina redonda · manija Roma 40»** (`pta-esqred-roma40`, familia Puertas, sin hoja en el Excel): muescas 150×35 arriba y abajo del canto izquierdo, **cerradura 75×90 de fondo redondo** (`BQ('der', 1000, 'fin', 75, 90, 37.5)`: radio = largo/2 → semicírculo; es «otro tipo de cerradura», distinta del 75×30 R15) y `manijaRoma(120)`: 2 perf. Ø14 a 120 del canto, a 800 y 1200.
- **«Manija Roma 40-60» o «60-40» = 40 cm entre perforaciones** (vocabulario del usuario), no dos variantes. Distancia al canto por defecto: **120** en esta plantilla (la de Optiglass sigue en 85).
- La cerradura nueva conserva la convención de las puertas: la cota 1000 va desde el piso hasta el borde del boquete (a diferencia de la Picoloro de Optiglass, centrada a 1000).
- Catálogo: **64** plantillas, 0 avisos con espesor 8. Los planos ya guardados con las muescas invertidas **no se corrigen solos** (cada plano guarda su copia): se corrigen en el editor intercambiando las dos medidas del recorte.
- ~~Cota «60» pegada al «110» en «Puerta esquina + perf. A/B»~~: resuelto por la regla de números visibles (abajo).

## Números del plano siempre visibles (2026-10-23)

Pedido del usuario: «que la numeración sea siempre visible y ordenada» (el 35 de una muesca 150×35 se deformaba encima de su propia línea). Cambio solo en `PlanoSVG.tsx`; aplica a editor, galería, imagen de Cloudinary e «Imprimir pedido».
- **Espacio ocupado** (`crearColocador`): cada texto anota su caja; el borde del vidrio, las líneas de cota, las auxiliares y las perforaciones (con su cruz) son obstáculos. Un número prueba sus posiciones en orden y toma la primera libre. **Lo que se ubica primero manda**: las cotas generales (ancho/alto) se calculan antes que el resto aunque se dibujen después.
- **Cotas** (`colocarCota`): si el número cabe entre las marcas (`largo ≥ cifras × 0,55 f`), va en su sitio del lado pedido o del otro lado; si no cabe o está tapado, **fuera de la línea, pasado el extremo que se aleja del vidrio y horizontal** (como los planos del taller), y luego corrido a cada lado. Las cotas ya no son componente: se ubican en el render del padre, en orden — un componente con estado compartido se ubicaría distinto con el doble render de StrictMode.
- **Una sola cota por columna**: filas de perforaciones con las mismas distancias al mismo canto y a menos de 25 % del alto entre sí (manija Roma, las 3 perf. de la flauta) se acotan una vez, sobre la fila de arriba. La cadena vertical sigue ubicando cada una.
- Etiquetas «N PERF. Øx», «BOQ…», «½ PERF.», chaflán, despunte y radio también anotan su caja; la de perforaciones y la de esquinas buscan sitio libre. La de despunte/radio va alineada desde su canto hacia adentro (centrada en la diagonal se salía del vidrio en las corredizas y tapaba «2 PERF. Ø6»).
- Verificado dibujando las 64 plantillas con el `PlanoSVG` real. Los planos ya guardados conservan su imagen hasta que se vuelvan a guardar.

## «DISEÑADO POR» en la hoja FOR-005 (2026-10-23)

Decisiones del usuario: la celda **A5** de cada hoja «PLANO X» dice `DISEÑADO POR: <nombre>` **en lugar de** «PROVEEDOR · ODP» (el ODP ya va en OBRA y el proveedor recibe su propio formulario); el nombre es el de **quien guardó el plano por última vez** (`pedido_pv_plano.actualizado_por` → `usuarios.nombre_completo`); aplica también a «Imprimir pedido» y al Excel del modo libre.
- Backend: `disenadoresDe(planos)` en `utils/detalleTecnico.ts` (una consulta para todos los planos). La usan `agregarPlanosAlExcel` (pasa el nombre a `hojaPlano`) y `GET /api/detalle-tecnico/pedido/:id` (cada plano trae `disenado_por`). `EncabezadoPlano` ya no lleva `proveedor`. Sin cambios de BD: `actualizado_por` existe desde el 2026-10-16.
- Frontend: `HojaDetalle` recibe `disenadoPor`; `HojasPedido` y `DisenoPedidoPage` lo toman del plano guardado (un plano nuevo sin guardar muestra «—» hasta guardarlo). Modo libre: el usuario conectado (`auth.user.nombre`), en la hoja y en `exportarExcel(pedido, disenadoPor)`.
- Un plano sin `actualizado_por` sale con «DISEÑADO POR: —».
