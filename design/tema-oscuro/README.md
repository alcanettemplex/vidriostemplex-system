# Tema oscuro del ERP

Maquetas del interruptor de tema y de su alcance, hechas con Claude Design. **No son código de la
aplicación**: no se importan, no se compilan y no entran en el bundle. Son el documento con el que se
decide qué se aplica antes de tocar `frontend-web/`.

**Canvas publicado:** https://claude.ai/artifact/3PTwZKCkEPtcYERN6cGgVK

---

## Por qué existe este canvas y no se amplió el de Proveedores

`design/proveedores/` ya contiene `Tokens.dc.html`, donde la paleta clara y la oscura están
diseñadas y documentadas token por token — de ahí salieron los valores que hoy están en
`frontend-web/src/index.css`. **La paleta no se decide aquí: ya está decidida.**

Lo que faltaba es de alcance global, no del módulo Proveedores: el interruptor que enciende el tema
y hasta dónde llega. Meter eso en el canvas de un módulo lo habría desvirtuado.

## Los tres artboards

| Archivo | Qué muestra |
|---|---|
| `Main.dc.html` | El ERP completo (barra superior, menú lateral, Proveedores) con el interruptor en el pie del menú. El control **modo** alterna claro/oscuro con los tokens reales |
| `Ubicaciones.dc.html` | Tres sitios donde cabe el interruptor, cada uno con su ventaja y su coste |
| `Alcance.dc.html` | Qué se oscurece y qué no el día que se encienda, con las cifras medidas sobre el código |

## El estado real, medido el 2026-09-18

- **16 tokens oscuros ya escritos** en `:root[data-theme='dark']` de `index.css`, listos y dormidos.
- **Nadie escribe `data-theme`**: no existe selector de tema en ninguna parte.
- **12 archivos de 128** consumen `var(--*)`, todos de `features/proveedores/`. Los otros 116 pintan
  `bg-white`, `text-slate-900` y demás a mano, así que el tema no los alcanza.
- La única clase `dark:` del proyecto (`ProveedoresPage.tsx`) es **un no-op**: `dark:bg-[var(--surface)]`
  resuelve a `#ffffff` mientras nadie ponga el atributo, o sea blanco sobre blanco. No hay ningún
  defecto visible hoy en producción.

## Decisión: NO se implementa (2026-09-18)

Las maquetas se hicieron, se midió el coste y **se descartó**: mucho esfuerzo para poco resultado
productivo. Ningún usuario del ERP ha pedido el tema oscuro.

Las tres preferencias quedaron elegidas por si algún día se retoma: interruptor **dentro del chip de
rol** (opción C de `Ubicaciones.dc.html`), **con «Auto»**, y alcance **global a todo el ERP**.

### Lo que costaría, medido sobre el código el 2026-09-18

| Medida | Valor |
|---|---|
| Clases de color distintas a mapear | 350 |
| Ocurrencias totales | 10.630 |
| Archivos afectados | ~116 |
| Concentración | top 40 clases = 76 % · top 80 = 88 % · top 120 = 94 % |

Esa concentración es lo que haría la migración mecánica viable —diez clases son la mitad del
trabajo—, pero el riesgo no está en el script sino en la cola larga: un `slate-900` que no era texto
sino el fondo de una insignia se invierte al reemplazarlo, y el proyecto **no tiene tests**
(`CLAUDE.md`, nota 1), así que la única verificación posible es abrir las ~21 pantallas en los dos
temas y mirarlas.

### Dos hallazgos que conviene no perder

1. **Los `Printable*` deben quedar fuera de cualquier migración futura** (8 componentes, 126
   ocurrencias). Representan tinta sobre papel, no superficies de interfaz: su `border-black` es
   correcto y debe seguir siendo negro.
2. **La ventana de impresión es segura por construcción.** `utils/printWindow.ts` escribe su propio
   `<html>` sin el atributo `data-theme`, así que las reglas `:root[data-theme='dark']` nunca aplican
   ahí y todo `var(--*)` resuelve al valor claro. No haría falta blindar nada con `@media print`.

### Plan que se habría seguido

**Fase 0** (una sesión, riesgo bajo): ampliar los tokens de acento en `index.css`, `darkMode: 'class'`
y colores semánticos en `tailwind.config.js`, script anti-parpadeo en `index.html`, contexto `useTema`
con `localStorage` y listener de `prefers-color-scheme`, y convertir el chip de rol en botón con su
desplegable. Al terminar, el interruptor funcionaría de verdad: Proveedores se oscurecería y los otros
20 módulos seguirían en claro **sin romperse**. **Fase 1**: mapa de ~120 reglas y un módulo piloto para
calibrarlo. **Fases 2…N**: el resto, por tandas, cada una con revisión visual.

## Datos de muestra

Los productos y precios de las tablas son inventados para que las maquetas se vean con contenido.
Templacol y Vitelsa sí son proveedores reales del sistema; Alúmina y Sika, no. El logo de la barra
superior es un marcador de posición: el real es el componente `TemplexLogo`.
