# Sistema visual "Cristal y Aluminio"

Base visual común de todo el ERP, aplicada el **2026-09-25** (Fase 1 del rediseño). Nace de una queja
concreta del usuario: *letras pequeñas, grises que no se distinguen del fondo, iconos genéricos* y
una interfaz que no transmite una empresa premium.

El nombre sale del oficio de Templex y de su logo: neutros fríos como el aluminio, azul cobalto como
el vidrio templado, y el lema de la marca, *Respaldo y confianza*, al pie del menú.

---

## Por qué se hizo global y no pantalla por pantalla

El frontend está escrito casi entero con utilidades de Tailwind sobre la paleta `slate` (~5.400
usos en 173 archivos). MUI aparece en solo 11 archivos. Por eso la legibilidad se corrigió en
**la configuración**, y las 173 pantallas la heredan sin tocar sus clases:

| Palanca | Dónde | Efecto |
|---|---|---|
| Escala `slate`/`gray` reajustada ("aluminio") | `frontend-web/tailwind.config.js` | Todo texto, borde y fondo neutro del ERP |
| Fuente Geist + cifras tabulares | `tailwind.config.js` + `src/index.css` + `src/index.tsx` | Toda la tipografía; montos alineados en columnas |
| `font-black` = 800 | `tailwind.config.js` | Los títulos dejan de "gritar" |
| Tema MUI alineado | `src/theme/theme.ts` | Pedidos PV y los modales del dashboard |
| Registro de iconos | `src/components/ui/icons.ts` | Los ~190 iconos del ERP, desde un solo archivo |

---

## Tokens

### Neutros — escala "aluminio"

Reemplaza a `slate` **y** a `gray` (mismos nombres de tono, otros valores). Se oscurecieron los
tonos medios, que son los del texto secundario:

| Tono | Antes | Ahora | Contraste sobre blanco | Uso típico |
|---|---|---|---|---|
| 50 | `#f8fafc` | `#f6f7f9` | — | Fondo de página |
| 100 | `#f1f5f9` | `#eef0f4` | — | Campos, fila expandida |
| 200 | `#e2e8f0` | `#e1e5eb` | — | Borde de tarjeta |
| 300 | `#cbd5e1` | `#c7cdd7` | 1,6 | Borde de campo. **No es color de texto** |
| 400 | `#94a3b8` | `#6f7a8c` | 2,56 → **4,34** | Texto terciario, iconos, placeholders |
| 500 | `#64748b` | `#555f71` | 4,76 → **6,44** | Texto secundario, etiquetas de columna |
| 600 | `#475569` | `#3f4858` | 7,58 → 9,21 | Texto de cuerpo atenuado |
| 900 | `#0f172a` | `#111620` | — | Texto principal |

Sobre los fondos oscuros que el ERP usa (`bg-slate-900`), `text-slate-400` queda en 4,17:1: sigue
siendo legible.

**Solo se reajustaron los neutros.** Los colores con significado (estados de ODP, caja, alertas:
`emerald`, `amber`, `rose`, `blue`, `indigo`…) no se tocaron: cambiarlos alteraría el semáforo que
cada rol ya sabe leer.

Los grises escritos a mano en hexadecimal (`#94a3b8`, `#64748b`…, 358 apariciones en ejes de
gráficos, `sx` de MUI y fallbacks `var(--x, #hex)` de Proveedores) se migraron a los mismos valores.

### Marca — `templex`

Azul cobalto del logo. `templex-600` (`#1f5ad6`) es el primario de MUI; `templex-400/300` son los
acentos sobre el menú oscuro. Disponible en Tailwind como `bg-templex-*`, `text-templex-*`, etc.

### Tipografía

- **Geist Variable** (UI) y **Geist Mono Variable**, servidas desde el propio build con
  `@fontsource-variable/*`, sin CDN: la ventana de impresión y los equipos con red restringida las
  cargan igual.
- Tailwind `font-sans`/`font-mono` apuntan a las variables CSS `--font-sans`/`--font-mono`
  (`index.css`), **no** a la lista de fuentes directa. Es lo que permite blindar los imprimibles
  (abajo).
- `font-variant-numeric: tabular-nums` en `body`: las cifras de montos y números de ODP ocupan el
  mismo ancho y las columnas quedan alineadas.
- Tamaño mínimo en pantalla: **11px**. Se subieron 519 usos de `text-[9px]`/`text-[10px]` a
  `text-[11px]`. Las micro-etiquetas dentro de píldoras (`NC`, `GAR`, `EN ESPERA`) quedaron en 10px
  en negrita.

### Elevación

`shadow-card`, `shadow-card-hover` y `shadow-float` en Tailwind; el tema MUI usa las mismas curvas en
`Paper` y `Dialog`.

---

## Iconos — Phosphor, detrás de un registro

- Librería: `@phosphor-icons/react`. Reemplaza a `lucide-react`, que se desinstaló.
- **Toda pantalla importa desde `src/components/ui/icons.ts`, nunca desde la librería.** El
  registro exporta los iconos con los nombres que el ERP ya usaba (`Printer`, `Truck`,
  `AlertTriangle`…), así la migración solo cambió la línea de `import` de 129 archivos y ningún JSX.
  Cambiar un icono, o la librería entera, es editar ese archivo.
- Peso por defecto **`bold`** (vía `IconContext` en `app/App.tsx`): el ERP pinta casi todos sus
  iconos a 12–16px, donde el trazo `regular` de Phosphor (1px) se pierde. Tamaño por defecto 24px,
  igual que lucide, para que ningún icono sin tamaño declarado mueva su layout.
- `weight="duotone"` para iconos protagonistas: paneles de áreas, indicador de página en la barra
  superior, tarjetas de KPI, estados vacíos.
- Los iconos de `@mui/icons-material` de las pantallas activas también pasaron al registro. La
  dependencia sigue instalada solo porque la usa el módulo huérfano `features/cotizaciones/`.

---

## Shell — navegación superior (2026-09-28)

Reemplazó al menú lateral fijo de la Fase 1. El contenido usa todo el ancho (256px más para
tablas y formularios).

- **Barra superior** (`components/common/Navbar.tsx`), azul noche, 64px, a todo el ancho:
  logo · áreas · buscador de módulos · favoritos · notificaciones · usuario (con la fecha y el
  cierre de sesión).
- **Áreas**: Dashboard, Comercial, Producción, Logística, Finanzas, Administración
  (`AREAS` en `navegacion.ts`). Cada una abre un panel (`MenuArea.tsx`) con sus módulos: icono,
  nombre, una línea de para qué sirve y una ★ de favorito. Un área sin módulos para el rol no
  aparece; con **un solo módulo**, la barra muestra el nombre del módulo como enlace directo (un
  instalador ve "Dashboard · Cotizador · Instalaciones · Manuales").
- **Ubicación**: el área activa se marca y muestra debajo el módulo actual ("Comercial / CRM &
  Leads"); en tablet/celular aparece junto al logo. No hay una segunda fila de migas.
- **Buscador de módulos** (`LanzadorModulos.tsx`), Ctrl+K / ⌘K desde cualquier pantalla: busca
  entre los módulos del rol por nombre, área, descripción y palabras clave, sin tildes. No consulta
  la BD ni busca registros (eso sería conectar `/api/search`).
- **Favoritos** (`useFavoritos.ts`): por usuario, en `localStorage` de ese navegador. Botón ★ de la
  barra, arriba del buscador y arriba del menú móvil.
- **Responsive**: ≥1280px áreas completas; 1024–1279px rótulos compactos (sin flecha, nombre de
  módulo más corto); <1024px las áreas pasan a un panel lateral (`MenuMovil.tsx`). El buscador
  se muestra como caja solo desde 1536px; debajo, como icono.
- **Alto de 64px a propósito**: siete pantallas calculan su alto con `calc(100vh - Npx)` y los
  filtros del tablero de Cotizaciones usan `sticky top-16`. Cambiar el alto obliga a revisarlas.
- **`navegacion.ts` es la fuente única de módulos, áreas y roles por ruta.** `AppRoutes.tsx`
  toma los roles de cada `<RoleRoute>` con `rolesDeRuta(path)`, y el menú filtra con la misma
  lista: un módulo nuevo se agrega ahí (ruta + área + descripción + roles). Antes eran dos listas
  que se desincronizaron — `gerencia` veía Toma de Medidas, Inventario y Usuarios y la ruta lo
  devolvía al Dashboard. Al unificar se conservaron los valores de las rutas (acceso real
  idéntico en las 19 rutas protegidas). Root entra a todo, pero su menú solo muestra los módulos
  con `paraRoot`. El backend sigue siendo la autoridad.

---

## Imprimibles: blindados a propósito

Los imprimibles se maquetaron sobre la fuente del sistema (Segoe UI en Windows), y varios son
formularios de proveedor con filas contadas (Pedido PV Templacol, 29 ítems). Geist con cifras
tabulares tiene otro ancho. Para que ningún formulario en papel desborde:

- `METRICA_IMPRESA` (`utils/printWindow.ts`, reutilizada en `utils/printSilent.ts`) redefine
  `--font-sans`/`--font-mono` a la fuente del sistema y apaga las cifras tabulares **dentro de la
  ventana de impresión**.
- El codemod de tamaños y grises excluyó todo archivo `Printable*`, los generadores de PDF y los
  planos del Cotizador (`Diagrama*`).
- `<TemplexLogo>` conserva el logo a color por defecto; el blanco es opt-in.

Lo que **sí** cambia en papel: los grises de texto salen un poco más oscuros (mejor contraste
impreso) y los iconos son de Phosphor.

---

## Jerarquía tipográfica — regla del usuario (2026-09-25)

> *"Si son títulos o toca resaltar, las letras negras y en negrita; el resto sin negrita pero
> negras."* La jerarquía la da el **peso**, no el gris.

Sobre fondo claro:

| Rol del texto | Color | Peso |
|---|---|---|
| Título de página (H1) | `text-slate-900` | `font-bold` (se permite `font-extrabold`) |
| Títulos de sección, de tarjeta, de modal | `text-slate-900` | `font-semibold` / `font-bold` |
| Encabezados de columna y rótulos de campo (aunque vayan en mayúsculas pequeñas) | `text-slate-900` | `font-semibold` |
| Lo que hay que resaltar: N° de ODP, nombre del cliente, montos, cifra de un KPI, estado activo | `text-slate-900` o su color semántico | `font-semibold` / `font-bold` (cifras de KPI: `font-extrabold`) |
| Todo lo demás: celdas, descripciones, subtítulos, fechas, metadatos, texto de ayuda, notas | `text-slate-800` (líneas secundarias: `text-slate-700`) | `font-normal` (`font-medium` solo en botones y controles compactos) |
| Placeholders, estados deshabilitados, guion de celda vacía | `slate-400`/`slate-500` | normal |
| Iconos decorativos | `slate-500`/`slate-600` o el color del contexto | — |

- **Nunca** `text-slate-300` ni `text-slate-400` como texto legible sobre fondo claro.
- Texto con significado de color (verde abonado, rojo saldo, ámbar alerta) conserva su tono, en
  **700–800** sobre fondos claros.
- Sobre fondo oscuro (`bg-slate-700`+, `bg-indigo-600`, degradados oscuros) la regla se invierte:
  `text-white` / `text-slate-100` / `text-slate-200`. No oscurecer ahí.
- Pastillas y badges: `font-semibold` (no `font-black`).

La escala `slate` **no** se oscureció globalmente para aplicar esta regla: los mismos tonos se usan
como texto claro sobre fondos oscuros en ~100 zonas, que habrían quedado negro sobre negro. Se aplicó
módulo por módulo (Fases 2–4).

---

## Reglas para código nuevo

1. Iconos: importar de `components/ui/icons`. Si falta uno, agregarlo al registro.
2. Grises: usar la escala `slate` de Tailwind, no hexadecimales. Para texto, `slate-500` o más
   oscuro; `slate-400` solo para texto terciario o iconos; `slate-300` nunca como texto sobre blanco.
3. Tamaño mínimo de texto en pantalla: 11px.
4. Acento de marca: `templex-*`. Los colores semánticos mantienen su significado actual.
5. Módulos del menú: `components/common/navegacion.ts`.

---

## Fases 2–4 — aplicadas el 2026-09-25/26

Ejecutadas por 8 agentes en paralelo, cada uno dueño exclusivo de sus carpetas, con la jerarquía
tipográfica de arriba como contrato. Solo presentación: ninguna lógica, texto ni imprimible cambió
(huella SHA-1 de los 15 archivos de impresión verificada antes y después).

| Fase | Alcance | Notas |
|---|---|---|
| 2a | ODP: listado, ficha y pestañas, formulario, modales | Codemod AST que respeta fondos oscuros y las áreas `#cot-print-area`/`#tm-print-area` |
| 2b | Producción y Toma de Medidas | Celdas de check sólidas (legibles a distancia); vista móvil reparada |
| 3 | Dashboard e Informe Ejecutivo | Tarjeta de KPI común: `components/dashboard/TarjetaKPI.tsx` |
| 4a | Contabilidad, Facturas vs Salidas, Clientes, ROOT, Manuales | |
| 4b | Compras, Inventario, Pedidos PV | Anchos de columna fijos entre grupos de Compras |
| 4c | CRM & Leads | Selector de etapas con nombres completos; pipeline usable en móvil |
| 4d | Instalaciones y Prospectos | Vistas de instalador/conductor revisadas a 390px |
| 4e | Proveedores, Usuarios, Configuración | Tokens `--text-*` según rol |

**Fuera de alcance a propósito:** Supervisión CRM (sistema visual propio), módulos huérfanos,
pantalla de inicio de sesión, tema oscuro. El Cotizador se integró después, en la Fase 5.
Deuda restante: `TECH_DEBT.md` (2026-09-25/26).

## Fase 5: Cotizador (2026-09-26)

Decisiones del usuario: **unificar con el ERP** (sin identidad propia), **pasos 1-2-3 en una sola
página** y alcance **5 pestañas + modales**. Solo presentación: backend, BD, motor, API e imprimibles
sin cambios (huella SHA-1 de `PrintableHojaTrabajo`, `DiagramaProducto` y `usePlano` idéntica).

- **Fuentes:** Manrope sale de `index.html` y la familia `cotizador`/`cotizador-head` sale de
  `tailwind.config.js`; la UI usa Geist. **Space Grotesk se queda** solo para las cotas del plano,
  que también se imprimen en la Hoja de Trabajo: quitarla movería la métrica del papel.
- **Kit (`components/ui/index.tsx`):** acento `indigo` → `templex`, rótulos en `slate-900`
  seminegrita, el primario deshabilitado pasa a `slate-200`/`slate-600` (antes blanco al 40 % sobre
  azul) y la cabecera de `Tarjeta` apila la acción debajo del texto en pantallas angostas.
- **Colores A-E de propuesta (`propuestaColor.ts`) conservados:** son significado, no decoración.
- ~~**Cotizar en tres pasos**~~ — reemplazado el mismo día por la mesa de trabajo (abajo).
- **Descripciones comerciales** en `features/cotizador/descripcionesModulo.ts`. La `descripcion`
  del backend (texto técnico, p. ej. "use sistema 8025 con alasCorredizas=3") queda como
  documentación interna y es el respaldo si un módulo nuevo no está en el mapa.
- **Despiece:** categoría y unidad pasan a segunda línea bajo la descripción, para que la tabla
  quepa en la columna y el valor total quede siempre visible. El botón fijo de guardar tiene fondo
  sólido y ya no tapa filas.
- **Detalle guardado:** nombre del módulo en vez del id, descripción con respaldo de medidas, ficha
  de cliente en dos bandas ("Sin cliente asignado" cuando falta).
- **Guardadas:** el "rojo" de la columna Ítems era el chip de estado desalineado bajo el encabezado;
  se alinearon encabezados y celdas.
- Ejecutada por 3 agentes (Cotizar · Actual/Guardadas/barra/modales · Calibración/Configuración).

---

## Cotizar: mesa de trabajo (2026-09-26, rediseño integral)

Pedido del usuario sobre una captura: la pantalla por pasos seguía obligando a bajar para saber
cuánto costaba y dónde agregar. Se le mostraron **tres arquitecturas** (A · mesa de trabajo con
resumen fijo, B · asistente por etapas, C · la propuesta como documento) y eligió la **A** sobre una
maqueta interactiva, con recálculo automático y cargos editables.

```
┌ Riel ──────┬──── Centro ─────────────────────────┬── Resumen (fijo) ─────┐
│ Ventanas   │ Encabezado + estado del precio       │ Este producto · Agregar│
│ Proyectante│ Formulario agrupado │ Vista técnica  │ Propuesta: ítems       │
│ Cabinas …  │ Avisos técnicos                      │ Mano de obra (auto)    │
│            │ ▸ Despiece (plegado)                 │ Cargos editables       │
│            │                                      │ Total · Guardar        │
└────────────┴──────────────────────────────────────┴────────────────────────┘
```

- **Riel** (`SelectorProducto`): vertical desde `lg`, subtítulo corto (`subtituloRiel`); rejilla
  compacta por debajo.
- **Centro** (`TabCotizar`): el formulario (`FormularioModulo`) recalcula **solo** al cambiar un campo
  (espera de 500 ms, respuestas viejas descartadas); "Calcular ahora" queda de respaldo. Los grupos
  dejaron de ser tarjetas: rótulo con línea dentro de un solo panel. El plano va al lado desde `2xl` y
  debajo en el resto. `ResultadoCalculo` pone los avisos arriba y el **despiece plegado** (se abre solo
  si hay líneas en error).
- **Resumen** (`ResumenPropuesta`, nuevo): siempre visible desde `xl` (sticky). Este producto con su
  precio y su botón; ítems de la propuesta (clic = editar); mano de obra automática; **cargos
  compactos editables** (cargan el predeterminado de Configuración, etiqueta
  "Predeterminado"/"Editado" y "Restablecer"); desglose y Total con Guardar. Por debajo de `xl` baja
  al final y aparece una **barra fija** con el total y "Agregar".
- **Salieron:** la franja "Estás cotizando para…", los pasos numerados, `FichaProducto` (sus datos
  pasan a `fichaProducto.ts → leerFicha`), `TotalPropuestaEnVivo` y el modo plegable de
  `PanelCargosObra` (que queda como vista completa en Actual). La barra de trabajo ya no repite las
  cifras en Cotizar.
- **Sin cambios de lógica:** estado de `CotizadorPage`, validación y llamada al motor, totales,
  backend y BD. Verificado con Playwright contra el backend local (18 comprobaciones, sin guardar).

---

## Gráficas y KPI (2026-09-28)

Pedido del usuario: que dashboards, KPI y gráficas **no se vean genéricos**, sin tocar la lógica.
Alcance: Dashboard gerencial (6 pestañas), CRM (Métricas, Dashboard Gerencial, Prospectos, Monitor,
Embudo, Reportes), Proveedores (comparador de precios) y Contabilidad (KPI). Método: skill `dataviz`.

### El kit — `frontend-web/src/components/charts/`

Toda gráfica, embudo, ranking y tarjeta de KPI se arma con estas piezas. **No escribir hex a mano ni
crear otra tarjeta de KPI.**

| Pieza | Para qué |
|---|---|
| `vizTokens.ts` | Colores: `CATEGORICA` (identidad), `ORDINAL_AZUL` + `tonoEtapa()` (embudos), `ESTADO` (bien/atención/grave/crítico), `CAJA_HEX` (semáforo de caja), `TINTA` (ejes, rejilla), `colorPorEntidad()` |
| `rechartsBase.ts` | `ejeX`, `ejeY`, `rejilla`, cursores, `puntaVertical`/`puntaHorizontal` para Recharts |
| `ChartCard` + `TablaDatos` | Tarjeta con título, descripción y conmutador Gráfica/Tabla |
| `ChartTooltip`, `Leyenda` | Tooltip y leyenda únicos |
| `BarraMagnitud` | Fila de ranking/embudo: rótulo, barra, cifra y % |
| `BarraApilada` | Reparto de un total. **Reemplaza a los donuts** |
| `Medidor` | Avance contra meta; `marca` dibuja una referencia (p. ej. promedio del equipo) |
| `Sparkline` | Tendencia mínima junto a una cifra |
| `Iniciales` | Avatar neutro; anillo opcional con el color fijo de la entidad |
| `Ayuda` | "?" con la explicación de un indicador (mouse y teclado) |
| `TarjetaKPI` (en `dashboard/`, re-exportada) | Única tarjeta de KPI. `densa` para grillas de 4+, `delta`, `ayuda` |

### Paletas validadas (script `validate_palette.js` del skill, sobre blanco)

- **Categórica**, azul Templex primero: `#1f5ad6 #eb6834 #1baf7a #eda100 #e87ba4 #008300 #4a3aa7 #e34948`.
  Pasa todo (CVD ΔE adyacente mín. 9,1; visión normal 19,6). Los tonos 3, 4 y 5 quedan bajo 3:1:
  al usarlos, rotular el valor. Cambiar un valor obliga a revalidar.
- **Ordinal** azul: `#7eaefc #4f8bf7 #1f5ad6 #1a47ad #142f73` (validada con `--ordinal`).

### Reglas

1. **Nunca doble eje Y.** Dos medidas de escala distinta → dos gráficas alineadas (así quedó
   "Evolución mensual" del Dashboard: montos arriba, cantidad de ODPs abajo).
2. **El color sigue a la entidad, no a la posición.** Nada de `colors[i % colors.length]`: un filtro
   no debe repintar a nadie. Categorías sin orden (productos, fuentes, motivos) → **un solo color**;
   el largo de la barra ya dice cuál pesa más.
3. **Etapas ordenadas → rampa azul** (`tonoEtapa`), la entrada del embudo más oscura.
4. **Los colores de estado son reservados** y van siempre con icono o texto. Los estados de ODP
   (`utils/estadosODP`) y de caja (`CAJA_HEX`) conservan su semáforo.
5. Rejilla sólida y tenue, sin punteado; barras finas con punta de 4px; el valor en tinta, nunca en
   el color de la barra.
6. Sin degradados en barras ni avatares, sin emojis como iconos (🥇🎯📞), sin cifras que cuentan
   desde 0: el número aparece directo.
7. Cifras grandes (KPI, titulares) con dígitos proporcionales; `tabular-nums` solo en columnas.

### Qué cambió visiblemente

- Dashboard: doble eje partido en dos; Estado de Caja de donut a barra apilada; el anillo de la meta
  pasó a cifra grande + barra + estado en palabras ("Meta cumplida / En camino / Rezagado"); embudo
  con rampa azul; checks y servicios en un solo tono; avatares neutros; vista en tabla en las
  gráficas principales.
- CRM: una sola tarjeta de KPI (antes 4 variantes con iconos SVG animados de `CRMIcons.tsx`, que se
  retiró); donut de origen → barra apilada; asesores con color fijo; ranking con número, no medallas.
  El mini-embudo de cada asesor ahora muestra la tasa real con la marca del promedio del equipo
  (antes: tasa ×2,5, escala no explicada).
- Proveedores: en el comparador, tendencia de los 3 últimos precios (datos que ya venían) y
  "+X% vs más bajo" solo cuando la modalidad coincide.
- Contabilidad: los 5 KPI pasan a `TarjetaKPI`.

### Correcciones que salieron en el camino

- CRM › Dashboard Gerencial: el `InfoTooltip` local no mostraba el texto (solo el "?").
- CRM › "Mayor Pipeline" mostraba el monto del asesor con mejor **conversión**; ahora busca el de
  mayor monto gestionado y muestra su nombre.
- Dashboard › Ventas: la meta caía a `120_000_000` fijo si no había configuración; ahora dice que no
  hay meta configurada.
- Código muerto retirado: `dashboard/charts/*` (4 componentes sin uso tras el cambio), `dashboard/KPICard.tsx`.
