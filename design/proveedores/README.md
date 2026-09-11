# Rediseño del módulo Proveedores

Maquetas interactivas del rediseño de `frontend-web/src/features/proveedores/`, hechas con Claude
Design. **No son código de la aplicación**: no se importan, no se compilan y no entran en el bundle.
Son el documento con el que se decide qué se aplica antes de tocar el módulo real.

**Canvas publicado:** https://claude.ai/code/artifact/fc717be2-597d-41b4-a41b-42b4d0977347

---

## Los ocho artboards

| Archivo | Qué muestra |
|---|---|
| `Main.dc.html` | Shell del módulo + pestaña **Consultar Precios**. Es el artboard de entrada |
| `CargarFacturas.dc.html` | Ingesta de FE partida en tres pasos: cargar → revisar → resolver |
| `PorMapear.dc.html` | Bandeja de códigos sin equivalencia, con la vinculación resuelta en la propia fila |
| `Proveedores.dc.html` | Maestro con las tres sub-pestañas de seguimiento |
| `FichaProveedor.dc.html` | **Vista nueva**: productos, histórico, facturas y pendientes de un proveedor |
| `Equivalencias.dc.html` | Auditoría de mapeos, con el histórico completo desplegable |
| `Tokens.dc.html` | El sistema de tokens en claro y oscuro |
| `Componentes.dc.html` | Las piezas que hoy están duplicadas a mano en los 12 archivos del módulo |

`canvas.json` es el manifiesto: posiciones, las dos páginas (*Pantallas* y *Fundamentos*), las notas
adhesivas y la vista de apertura.

---

## La marca `BACKEND NUEVO`

Todo lo que aparece **rodeado de rosa punteado** con esa etiqueta **no existe todavía** y no se puede
aplicar sin trabajo de backend. El resto es reorganización y CSS sobre endpoints que ya están.

Son cinco cosas:

1. **Candidatos con porcentaje de confianza** al vincular (`PorMapear`). Hoy
   `VincularCodigoModal.tsx` hace `GET /api/catalogo?q=` — es un buscador de texto libre, no un
   rankeador. La materia prima existe (`ProductoAlias` guarda los sinónimos aprendidos); falta quien
   puntúe. El formulario en línea sí es aplicable: `POST /codigos-pendientes/:id/vincular` ya recibe
   lo mismo que el modal.
2. **Contadores «repetidos en varias facturas» y «sin código en el XML»** (`PorMapear`). Derivables,
   pero solo sobre los 200 ítems que trae la página — la misma trampa que se corrigió creando
   `contarPendientes` para no descargar la bandeja entera y hacerle `.length`.
3. **KPI «donde es el más barato»** (`FichaProveedor`). Agregado cruzado entre proveedores.
4. **KPI «subida media 6 meses»** y la **columna «frente al mejor»** (`FichaProveedor`). Ídem.
5. **Pestaña Histórico completa** (`FichaProveedor`). El gráfico de movimientos por mes y sus tres
   tarjetas.

Esos agregados deben resolverse en SQL, como ya hace `resumenSeguimiento` con `COUNT(*) FILTER`, y no
trayendo filas para sumarlas en JS: el egress de Supabase está en ~50-60 MB/día (`project_egress_estado.md`)
y una ficha que se abre veinte veces al día lo nota.

---

## El hallazgo que originó el rediseño

Las siete variables CSS que usa el módulo —`--surface`, `--border`, `--text`, `--text-muted`,
`--primary`, `--bg`, `--surface-subtle`— **no están definidas en ninguna parte del proyecto**.
`index.css` solo carga Tailwind, no hay `:root`, no hay `setProperty` y `tailwind.config.js` tampoco
las declara. Los 12 archivos de `features/proveedores/` son los únicos del ERP que las nombran.

- Donde el código escribió fallback (`var(--border, #cbd5e1)`) funciona por accidente, con el color
  del fallback.
- Donde no lo escribió, la declaración es **inválida**: `background: var(--surface)` se queda
  transparente y `border: 1px solid var(--border)` desaparece.

`ConsultarPreciosTab.tsx` usa la forma sin fallback casi en todo el archivo, igual que el shell de
`ProveedoresPage.tsx`. La pestaña principal del módulo se está renderizando sin fondos ni bordes.
El artboard `Tokens.dc.html` es la definición que falta; va en `index.css` bajo `:root`.

---

## Editar el canvas

Dos caminos, y **no se mezclan bien**:

**Desde la web.** Abrir el enlace y editar con el editor del canvas (clic para seleccionar, panel de
propiedades, texto en línea). **Save** publica una versión nueva para todos. Eso deja los archivos de
esta carpeta desactualizados: hay que extraerlos de vuelta antes de volver a construir desde aquí.

**Desde el repo.** Editar los `.dc.html`, reconstruir y republicar:

```bash
# desde design/proveedores/
node "<skill>/seed-canvas.mjs" \
  --template "<skill>/payload.template.html" \
  --out modulo-proveedores.html \
  --title "Módulo Proveedores" \
  --artboard Main.dc.html --artboard CargarFacturas.dc.html \
  --artboard PorMapear.dc.html --artboard Proveedores.dc.html \
  --artboard FichaProveedor.dc.html --artboard Equivalencias.dc.html \
  --artboard Tokens.dc.html --artboard Componentes.dc.html \
  --canvas canvas.json
```

`modulo-proveedores.html` es el resultado —unos 2 MB, con el editor embebido— y está en
`.gitignore`: se regenera, no se versiona. Lo que se versiona son las fuentes de esta carpeta.

Si alguien guardó desde la web y estas fuentes quedaron atrás, se recuperan con
`seed-canvas.mjs --extract <pagina-descargada> --to <carpeta-vacia>`.

---

## Formato de los archivos

Cada `.dc.html` es un *Design Component*: HTML autocontenido con `{{holes}}` que se resuelven desde
`renderVals()` en una clase `Component extends DCLogic` al final del archivo. Tres cosas que rompen
**en silencio** si se tocan sin cuidado:

- La línea `<script src="./support.js"></script>` del `<head>` se reemplaza en tiempo de render. No
  se quita ni se inlinea.
- `{{ }}` es solo búsqueda por ruta con puntos. No admite expresiones: `{{a + b}}` o
  `{{x ? 'a' : 'b'}}` no fallan, simplemente no pintan. Lo que varíe se calcula en `renderVals()`.
- Los SVG van literales en el marcado. Un `innerHTML="{{icono}}"` no lo aplica React y el ícono
  desaparece sin aviso.

Los datos de las maquetas (Vitelsa, Templacol, TUB0510, los CUFE) son **realistas pero inventados**.
No salieron de Supabase.
