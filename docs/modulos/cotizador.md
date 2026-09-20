# Módulo Cotizador

Cotizador de ventanas, puertas, cabinas y espejos de aluminio/vidrio. Portado desde un proyecto
standalone como módulo `/cotizador` del ERP, **aislado del flujo**: no genera ODP, no lee clientes
ni el catálogo del módulo Proveedores por su cuenta (sí toma costos de ahí, ver más abajo).

Solo `root` / `admin`.

---

## Lo primero que hay que entender: cotizar y cortar son dos cosas distintas

Es la confusión que más tiempo ha costado en las sesiones, así que va arriba del todo.

| | Qué hace | Estado |
|---|---|---|
| **Cotizar** | Metes medidas → sale el precio | ✅ Funciona desde la Etapa 3 |
| **Orden de corte** | El papel para el taller: "corta este perfil a 483 mm" | ⚙️ Habilitado desde 2026-09-19, con ±1 mm |

Toda la maquinaria de calibración, niveles A/B/C y `aptitudOrden.ts` pertenece **exclusivamente** a
la segunda. Un problema de calibración nunca impidió cotizar.

Verificación en vivo (2026-09-19): Sistema5020, 1000×1500 mm, mate, vidrio claro 4 mm →
**$465.854,56**, sin errores ni advertencias.

---

## Dónde vive

**Backend**
- `backend-api/src/cotizador/` — motores portados (~4.700 LOC), `cache.ts`, `modules/` (6 módulos),
  `lib/` (cálculo, despiece, plano, aptitud, calibración, sincronización con Proveedores)
- `backend-api/src/controllers/cotizador_*.controller.ts` — 9 controladores
- `backend-api/src/routes/cotizador.routes.ts` — **40 endpoints** bajo `/api/cotizador`
- `backend-api/src/scripts/pruebas_cotizador/` — 5 suites, `npm run test:cotizador`

**Frontend** — `frontend-web/src/features/cotizador/`, 5 pestañas:
Cotizar · Actual · Guardadas · Calibración · Configuración. Sin Redux (estado local, mismo criterio
que el Explorador ODP).

**BD** — 21 tablas en el schema **`cotizador`**, sin prefijo: `cotizador.producto`, no
`public.cotizador_producto`. Los archivos y clases sí conservan el prefijo
(`CotizadorProducto`, `cotizador_producto.model.ts`).

### Tres trampas del schema propio

1. Los 8 ENUM `enum_cotizador_*` **siguen en `public`** a propósito: el pooler de Supabase en modo
   transacción no propaga `search_path`, y `public` siempre resuelve.
2. `auditoria_log.tabla` guarda el nombre **calificado** (`cotizador.producto`).
   `root.controller.ts` lo parte con `identificadorSql()`.
3. Cualquier consulta a `pg_tables`/`information_schema` que filtre por `'public'` deja el
   cotizador fuera. Ya mordió una vez, en el respaldo del panel ROOT.

Script reversible: `2026-09-12_mover_cotizador_a_schema.ts --revertir`.

---

## Unidades: el vendedor ve milímetros, el motor calcula en centímetros

Los campos siguen llamándose `anchoCm` / `altoCm` porque así lo espera el motor verificado contra el
golden master. La conversión ×10 / ÷10 vive **enteramente en `CampoDinamico.tsx`** (detecta
`campo.nombre.endsWith('Cm')`).

⚠️ **No reintroducir la conversión en ningún otro punto del árbol.**

---

## Niveles de corte: qué significan de verdad

Cada pieza de cada diseño tiene un nivel, y el del diseño es el **peor** de sus piezas.

| Nivel | Qué significa | ¿Sirve para cortar? |
|---|---|---|
| **A** | Fórmula determinada, dispersión 0 | Sí |
| **B** | Candidatos coinciden **dentro de 1 mm** — error **acotado** | Sí, desde 2026-09-19 |
| **C** | Error **crece con el vano** (hasta 3,3 mm, sin tope) o sin modelo | **No** |

La diferencia entre B y C no es de grado. Un error acotado se absorbe con la holgura de instalación
(3 mm configurados); uno que se agranda con el tamaño de la ventana, no.

Reparto actual: **15 A · 124 B · 24 C** de 163 diseños. A nivel de pieza: 980 perfiles A, 222 B.

### Por qué existe el nivel B (la causa raíz, verificada el 2026-09-19)

Los despieces se extrajeron del software de origen en **tres vanos: 1000×1200, 1000×600 y
500×1200**. Los tres son múltiplos de 100, así que toda división cae exacta y **el truncamiento
nunca se manifiesta**: `trunc((A−69)/2)` y `trunc((A−70)/2)` dan lo mismo en 1000 y en 500.

**No falta información: se preguntó en medidas que no podían revelarla.**

Dato revelador: de los 980 perfiles nivel A, **975 usan `exacto` con n=1** — son piezas que no
dividen (marco = ancho, jamba = alto − k) y por eso nunca redondean. Los dudosos son exactamente
las piezas que se reparten entre hojas. Por eso **no hay convención transferible de A a B**: forzar
truncamiento en los dudosos resuelve 0 de 419 (probado), porque la ambigüedad está en la constante,
no en la operación.

### Cómo se cerraría de raíz

Una sola lectura en una medida **no redonda**. La óptima, calculada por barrido:
**903 × 601 mm** → cierra 241 de 419 piezas (57,5 %); con una segunda (902×701), 293 (69,9 %).

Los datos crudos están en `multimedida.json` (4,2 MB, 1.992 extracciones, 652 diseños) dentro del
proyecto externo, y los 139 diseños afectados están **todos** cubiertos por su `fix_mapa.json`.

🔴 **Bloqueador actual: la cuenta del software de origen está vencida.** Sin ella no hay extracción.
Alternativa sin suscripción: el catálogo técnico del fabricante de perfilería, que trae las cotas y
permite escribir las fórmulas directamente en vez de deducirlas.

---

## Aptitud para la orden de corte — las 8 condiciones

`cotizador/lib/aptitudOrden.ts`. `CODIGOS_MOTIVO` es contrato estable; la redacción puede cambiar.
El frontend **solo renderiza `texto`, no ramifica por `codigo`**.

| # | Condición | Notas |
|---|---|---|
| 1 | Cotización aprobada | |
| 2 | Tiene despiece por diseño | Un espejo o tablero no lo tiene: bloqueo legítimo |
| 3 | Nivel aceptable | Acepta **A y B**; frena C y nivel *desconocido* |
| 4 | Holgura configurada | 1 fila global vigente, 3 mm / 3 mm |
| 5 | Apto para corte | Ver "el artefacto del blob", abajo |
| 6 | Sin errores de presupuesto | |
| 7 | Sistema en producción | **Desactivada** — `EXIGIR_SISTEMA_EN_PRODUCCION = false` |
| 8 | Despiece vigente | Recalcula y compara contra lo guardado |

### Dos constantes que gobiernan todo esto

- `NIVELES_APTOS_PARA_CORTE` en `motorDespiece.ts` — `{A, B}`
- `EXIGIR_SISTEMA_EN_PRODUCCION` en `aptitudOrden.ts` — `false`

**Deben moverse juntas con la condición 3**, que replica el criterio para redactar el motivo. Si
divergen, un ítem sale apto sin explicación o al revés. Ambas están comentadas en sitio con el
razonamiento y la fecha. Ver `TECH_DEBT.md` 2026-09-19 (2).

### El artefacto del blob — releer antes de tocar la condición 5

`resultado.aptoParaCorte` es un **booleano grabado en el JSONB el día que se cotizó el ítem**, con
la regla de niveles vigente entonces. Cambiar el motor **no reescribe los blobs ya guardados**.

Cuando B pasó a ser apto, las 4 cotizaciones existentes seguían bloqueadas con ese booleano en
`false` pese a tener **cero líneas en error**. La condición 5 pasa a **reevaluar el criterio sobre
los datos crudos del blob** (el nivel y si alguna línea quedó en error), que son hechos del cálculo
y no cambian cuando cambia la regla. Si el blob ni trae `items`, se respeta lo guardado.

⚠️ Y la supresión del motivo es `nivel === "C"`, **no** `"B" || "C"`. Con B apto, un
`aptoParaCorte:false` en un diseño B solo puede venir de una medida inválida; callarlo daría un
**bloqueo mudo**.

---

## Calibración — existe entera, pero no es obligatoria

Tablas (`calibracion_sistema` / `margen` / `holgura` / `contraste` / `historial`), matemática
(`lib/calibracion.ts`), 13 endpoints de escritura y la pestaña `TabCalibracion.tsx`. **Todo
operativo.**

Estado real en BD: `calibracion_margen` **0**, `calibracion_contraste` **0**,
`calibracion_sistema` **0**, `calibracion_holgura` 2 (1 vigente, global, 3/3 mm).

Dos invariantes que no se negocian:
- **AUSENTE ≠ CERO.** "No he medido esta pieza" y "la medí y no lleva descuento" llevan a decisiones
  distintas: un nivel sin valor se **omite** del objeto, nunca se guarda como 0.
- **El contraste es dato crudo:** jamás se corrige ni se borra, solo se anula lógicamente. Y
  `medida_sistema_bruta_mm` es **sin margen aplicado** — si se contrastara la medida ya corregida,
  la calibración se validaría a sí misma.

`EN_PRODUCCION` nunca se escribe a mano: "reanudar" un sistema escribe `'VALIDADO'` como centinela,
porque `madurezDeSistema` solo trata de forma especial la cadena exacta `'EN_CALIBRACION'`.

---

## Precios: de dónde sale el costo

`cotizador.producto` se vincula a `catalogo_productos` por `codigo`, y de ahí a `proveedor_producto`.
El motor `lib/sincronizacionProveedores.ts` (enganchado en `actualizarPrecio`) mueve los costos.

- **Multiplicadores por categoría** en `cotizador.multiplicador_categoria`, configurables desde la
  pestaña Configuración. Una categoría sin fila devuelve `configurado: false`, **no cero** — un
  multiplicador en cero pondría todos los precios en cero.
- Un producto sin `catalogo_producto_id` **nunca** se sincroniza: su costo queda congelado en lo que
  esté escrito a mano.
- ⚠️ El campo **AIU se divide, no se multiplica** (`subtotal / aiu`): el 4 % se escribe **0,96**.
  Escribir `0,04` multiplicaba el total por 25. El piso está en 0,5 en frontend y backend.

Ver `docs/modulos/compras.md` para las reglas del módulo del que vienen esos costos.

---

## Pruebas

`npm --prefix backend-api run test:cotizador` — 5 suites, **37 pruebas**. En verde desde el
2026-09-19 (37/37).

### ⚠️ Bajar el backend dev antes de correrlas

Las suites precargan la caché, que abre su propia conexión a Supabase. Con `npm run dev` levantado
se agotan las **15 conexiones del pooler** y fallan con:

```
SequelizeConnectionError: (EMAXCONNSESSION) max clients reached in session mode
```

Engaña, porque **no falla la suite que toca el cambio**: fallan las que dependen de la caché, que
pueden ser cualquiera. Mordió dos veces en la misma sesión y da la impresión de una regresión que no
existe. Liberar el puerto 3001, correr, y volver a levantar.

### El centinela del catálogo

`humo.test.ts` afirma un número exacto de productos (**469** desde el 2026-09-16). No es un dato
decorativo: vigila que los **126 productos `PROVISIONAL`** —precios del software externo, no
verificados— no se mezclen con el catálogo real (464 `CATALOGO` + 5 `ALTA`). Si el conteo cambia sin
que nadie lo espere, esa mezcla es la primera sospecha.

Cada vez que crezca legítimamente hay que **actualizar el número y dejar el renglón** explicando por
qué, como hacen las entradas anteriores del archivo. Un centinela que falla siempre deja de vigilar:
el fallo que importa se confunde con el ruido de fondo.

⚠️ El **golden master** (`test:cotizador:golden`) sí sigue obsoleto desde el 2026-09-11 — 6 de 10
fallan por datos, no por código. **No confiar en él como red antes de regenerarlo.**

---

## Decisiones cerradas — no volver a preguntar

1. Port completo pero **aislado** del flujo del ERP.
2. Todo a Postgres con caché en memoria al arrancar — necesaria, no es solo egress: los motores son
   síncronos y Sequelize es async.
3. **Sin Redux** para el estado del módulo.
4. Identidad visual propia dentro del lenguaje del ERP: Space Grotesk / Manrope.
5. Prefijo `cotizador` en todo — choque real con `/api/cotizaciones`, `features/cotizaciones/` y
   `cotizacionesSlice`, que son el COTModal de la ODP, otra cosa.
6. Sin identidad de usuario: `asesor` / `registrado_por` son texto libre, sin FK a `usuarios`.
7. Auditoría solo en 5 tablas: producto, precio_override, cotizacion, cotizacion_item, parametro.
8. **El nombre del software externo de origen no puede aparecer en ningún dato ni código del ERP.**
   Verificación: `grep -ri "alumsoftware" backend-api/src frontend-web/src` → 0.
9. Unidades visibles en milímetros; contrato interno en centímetros.
10. El milímetro del nivel B es **indiferente**, en aluminio y en vidrio (2026-09-19).

---

## Lo que falta

- **PDF de cotización** — único bloque sin empezar de la Etapa 4. `pdfmake@0.3.11` **exacto, sin
  `^`** (0.3 es pre-release); **no** instalar `@types/pdfmake`, describe la API 0.2. La Hoja de
  Trabajo sale **siempre** (no pasa por `/aptitud`) y no imprime medidas calculadas de pieza ni
  cotas de paño.
- 3 de 8 suites de pruebas: `aptitudOrden`, `hojaTrabajo`, `pdf`.
- Regenerar golden master y centinela del catálogo.
- Los 24 diseños nivel C.

---

## Lección transversal

Postgres **no preserva el orden de claves** de un objeto en JSONB. Cualquier comparación de
fidelidad contra JSON de origen debe usar deep-equal insensible al orden — nunca
`JSON.stringify(a) === JSON.stringify(b)`. Dio 129 falsos positivos la primera vez.
