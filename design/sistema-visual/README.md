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
- `weight="duotone"` para iconos protagonistas: menú lateral, indicador de página en la barra
  superior, tarjetas de KPI, estados vacíos.
- Los iconos de `@mui/icons-material` de las pantallas activas también pasaron al registro. La
  dependencia sigue instalada solo porque la usa el módulo huérfano `features/cotizaciones/`.

---

## Shell

- **Menú lateral** (`components/common/Sidebar.tsx`): panel azul noche de altura completa, logo en
  blanco (`<TemplexLogo tono="blanco">`), iconos en duotono, indicador de página activa con
  resplandor de marca.
- **Barra superior** (`components/common/Navbar.tsx`): solo sobre el área de trabajo; muestra
  *sección › página*, la fecha, las notificaciones y el menú de usuario (nombre, rol legible, cerrar
  sesión).
- El mapa de ítems, el filtro por rol y las etiquetas de rol viven en
  `components/common/navegacion.ts`, compartido por los dos. **Agregar un módulo al menú es agregar
  una entrada ahí.** Recordar que `allowedRoles` solo decide la visibilidad en el menú; la protección
  de la ruta sigue en `<RoleRoute>` y en el backend.
- Las medidas que las páginas descuentan no cambiaron: menú `w-64`, barra `h-16`
  (`md:pl-64`/`pt-16` en `AppShell`).

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
- **Cotizar en tres pasos:** 1 · producto (7 tarjetas compactas), 2 · formulario a la izquierda y
  plano/ficha/despiece a la derecha, 3 · cargos de obra a lo ancho y **plegables** (`plegable` en
  `PanelCargosObra`, preferencia en `localStorage` `cotizador.cargosObra.plegado`).
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
