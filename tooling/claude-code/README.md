# Configuración de Claude Code

El usuario trabaja en dos máquinas —casa y oficina— y **ninguno de los dos archivos de
configuración viaja por git**: `.claude/` está en `.gitignore` y `~/.claude/` vive fuera del repo.
Esta carpeta existe para que la configuración sí viaje; copiarla sigue siendo un acto manual y
deliberado, porque nada de aquí se aplica solo.

## Los dos archivos

| Plantilla | Copiar a | Qué aporta |
|---|---|---|
| `user-settings.json` | `~/.claude/settings.json` | Modelo, idioma, nivel de esfuerzo y accesos globales |
| `project-settings.json` | `.claude/settings.json` (raíz del repo) | El allowlist de comandos del monorepo (npm, git de lectura, node) |

## Instalación en una máquina nueva

```bash
# desde la raíz del repo
mkdir -p ~/.claude
cp tooling/claude-code/user-settings.json    ~/.claude/settings.json
cp tooling/claude-code/project-settings.json .claude/settings.json
```

Si ya existe un `~/.claude/settings.json` con cosas propias, **fusiónalo a mano** en vez de
sobrescribirlo.

⚠️ **`user-settings.json` trae rutas de esta máquina** (`C:\Users\User\.claude` en `allow` y
`additionalDirectories`). Si el usuario de Windows de la otra máquina es distinto (por ejemplo
`PRODUCCION`), esas dos líneas hay que ajustarlas a mano con la ruta real — copiarlas tal cual
apuntaría a una carpeta que no existe ahí.

## Qué hace esta configuración, y qué no

No hay `bypassPermissions` ni hook `SessionStart`: cada máquina confirma sus propios comandos y no
hay aviso automático de git al abrir sesión — decisión del usuario el 2026-09-11 al notar que las
dos máquinas habían divergido en este punto (una tenía bypass + hook, la otra no). Se
mantiene esta versión (sin bypass) como la oficial en ambas.

`project-settings.json` solo trae el allowlist de comandos de desarrollo del monorepo (`npm`,
`node`, `git` de solo lectura); todo lo demás sigue pidiendo confirmación en el modo por defecto.

**Lo que no es un permiso** es la metodología de CLAUDE.md —propongo → preguntas → plan → «procede»—
y la regla de no hacer commit ni push por iniciativa propia. Esas son reglas de comportamiento,
independientes del modo de permisos configurado.

## Sincronización entre máquinas

El riesgo real de trabajar en dos máquinas no es olvidar el `pull`: es olvidar el `push`. Al día
siguiente se arranca sobre código viejo y aparecen dos `main` divergentes que hay que mezclar a
mano. Sin el hook `SessionStart`, revisar `git fetch` + `git status` al empezar sesión es manual.

## Mantener esto al día

Si cambias la configuración en una máquina, **vuelve a copiarla aquí y commitea**. Estas plantillas
no se sincronizan solas; si se quedan atrás, la otra máquina hereda una configuración vieja sin que
nada lo avise.
