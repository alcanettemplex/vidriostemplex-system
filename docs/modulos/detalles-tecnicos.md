# Módulo Detalles Técnicos

Editor de **planos de vidrio templado** para los pedidos a VITELSA / TEMPLACOL. Reemplaza el Excel
`1.1 DETALLES TECNICOS.xlsx` (60 hojas dibujadas a mano con bordes de celda): cada plano es una
**plantilla paramétrica** —contorno, esquinas (despunte, radio, muesca), perforaciones, boquetes,
chaflanes y notas— que se dibuja a escala con cotas automáticas, se valida contra reglas de temple y
se exporta a Excel en el formato **FOR-005** (hoja RESUMEN + una hoja «PLANO X» por plano, con el
plano como imagen PNG).

> **Estado (2026-09-27): integrado AISLADO.** Traído al ERP desde el prototipo standalone
> `…\Compra VITELSA\editor-detalles-tecnicos` por orden del usuario: "integrarlo como un módulo de
> producción, solo admin, de forma aislada hasta que dé las instrucciones de cómo integrarlo".
> **No toca backend, base de datos ni Pedidos PV.** Nada del plan de integración (abajo) se
> implementa sin orden explícita.

---

## Dónde vive

- **Frontend:** `frontend-web/src/features/detalles-tecnicos/`
  - `DetallesTecnicosPage.tsx` — la página (era `App.tsx` del prototipo)
  - `estado.ts` — `usePedido()`: pedido, historial deshacer/rehacer, persistencia
  - `components/` — `PanelPedido`, `HojaDetalle`, `PlanoSVG`, `PlanoEditable`, `EditorPlano`,
    `Galeria`, `DialogoMedidas`
  - `modelo/` — lógica pura: `tipos`, `geometria`, `validaciones` (`REGLAS`), `plantillas` (60),
    `herrajes` (12 kits), `mover`, `constructores`, `formato`, `opciones`
  - `exportar/excel.ts` — ExcelJS; se carga con `import()` sólo al exportar
- **Ruta:** `/detalles-tecnicos`, `<RoleRoute allowedRoles={['admin']}>` (root entra por el bypass
  general de `RoleRoute`).
- **Menú:** sección **Producción**, "Detalles Técnicos", icono `PencilRuler`, `allowedRoles: ['admin']`
  (`components/common/navegacion.ts`).
- **Logo del formato:** el del ERP, `public/assets/images/logotemplex.png` (decisión del usuario,
  2026-09-27: el prototipo traía otro). Constante `LOGO_DETALLE_TECNICO` en `modelo/formato.ts`; en el
  Excel va a 152×52 px para conservar su proporción (225×77).
- **Documentación del prototipo** (manual de uso, arquitectura, catálogo de las 60 plantillas, plan de
  integración): en la carpeta del prototipo, `docs/01…05`. No se copió al ERP.

## Qué se adaptó al traerlo (2026-09-27)

| Del prototipo | En el ERP | Por qué |
|---|---|---|
| Vite, `import.meta.env.BASE_URL` | `process.env.PUBLIC_URL` | El ERP es CRA |
| `[...set]`, `for…of` sobre `Map` | `Array.from(…)` | El ERP compila a ES5 sin `downlevelIteration` |
| 21 iconos de `@mui/icons-material` | `components/ui/icons.ts` (alias con los nombres originales) | Regla del sistema visual. Se agregaron `Hand`, `LinkBreak` y `Redo2` al registro |
| `window.print()` + `@media print` | `abrirVentanaImpresion()` sobre una `HojaDetalle` oculta | Dentro del ERP imprimiría el menú y la barra |
| `height: 100vh` | `calc(100dvh - 64px)` | Va dentro de `AppShell` (barra de 64 px) |
| `ThemeProvider` propio (azul `#1565c0`) | El `theme/theme.ts` global del ERP | Un solo tema |
| Clave `dt-editor-prototipo-v1` | `erp-detalles-tecnicos-v1` | Separada del prototipo |
| — | Dependencia nueva **`exceljs@^4.4.0`** en `frontend-web` | Decisión del usuario (2026-09-27), misma versión que el backend. `xlsx` (SheetJS) no admite imágenes ni estilos |

Los componentes siguen en **MUI** (no Tailwind): se trajo tal cual para no reescribir 4.500 líneas
antes de decidir la integración. Re-maquetarlo al sistema "Cristal y Aluminio" queda para esa fase.

## Limitaciones mientras esté aislado

- **El pedido vive en `localStorage` del navegador**: no se comparte entre máquinas ni usuarios, y dos
  admins en el mismo navegador comparten el mismo pedido. Exportar el Excel es la única forma de
  conservar el trabajo fuera del navegador.
- Los datos del encabezado (número de pedido, ODP, cliente, asesor) se escriben a mano: no se leen de
  Pedidos PV ni de la ODP.
- Las **reglas de temple** (`modelo/validaciones.ts › REGLAS`) son de referencia de la industria y
  **avisan, no bloquean**, hasta confirmarlas con VITELSA.

## Plan de integración (pendiente de orden del usuario)

El plan completo está en `docs/05-PLAN-INTEGRACION-ERP.md` del prototipo (2026-09-25). Resumen y
puntos verificados contra el ERP el 2026-09-27:

- Tabla `pedido_pv_plano` (JSONB `pieza`) colgada del **pedido PV principal** (`sufijo IS NULL`): las
  extensiones `-1, -2` se borran y recrean en cada `asignarItems`.
- Controlador propio (no importar `pedido_pv.controller`: ciclo de imports, `TECH_DEBT.md` 2026-09-03).
- Hojas «PLANO X» anexadas al Excel oficial del proveedor.
- **7 decisiones abiertas (D1–D7)**: quién edita, renderizador de imagen en el servidor, columnas
  RADIOS/CHAFLÁN, edición tras ENVIADO, significado de DES, letras con medidas distintas, bug H3.
- **Bug H3 sigue vivo** (verificado 2026-09-27): "Asignar ítems" de Pedidos PV no precarga `dt` ni
  `observaciones_pv` y al guardar las deja vacías (`PedidosPVPage.tsx`, `itemsExtras`).
- **Datos reales (2026-09-27):** 368 ítems con `odp_items.dt` en ~300 ODP (A 230, B 81, C 35, D 11,
  E 5, F 3, G 1, H 1, y una "a" minúscula), **ninguno con plano**: "DT sin plano" será el caso normal
  del histórico. `descuentos` (columna DES de VITELSA) tiene 20 valores: 17 numéricos (2, 1, 4) y
  textos libres ("SI", "DESCUADRADO") que un llenado automático pisaría.
- **El renderizador de plano → imagen** es la misma decisión abierta que tiene el Cotizador
  (`cotizador-vision.md`): decidirla una vez para los dos.
