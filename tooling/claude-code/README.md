# Configuración de Claude Code

El usuario trabaja en dos máquinas —casa y oficina— y **ninguno de los dos archivos de
configuración viaja por git**: `.claude/` está en `.gitignore` y `~/.claude/` vive fuera del repo.
Esta carpeta existe para que la configuración sí viaje; copiarla sigue siendo un acto manual y
deliberado, porque nada de aquí se aplica solo.

## Los dos archivos

| Plantilla | Copiar a | Qué aporta |
|---|---|---|
| `user-settings.json` | `~/.claude/settings.json` | El **modo de permisos**, el modelo y el nivel de esfuerzo |
| `project-settings.json` | `.claude/settings.json` (raíz del repo) | El allowlist y el **hook `SessionStart`** que avisa del estado de git |

## Instalación en una máquina nueva

```bash
# desde la raíz del repo
mkdir -p ~/.claude
cp tooling/claude-code/user-settings.json    ~/.claude/settings.json
cp tooling/claude-code/project-settings.json .claude/settings.json
```

Si ya existe un `~/.claude/settings.json` con cosas propias, **fusiónalo a mano** en vez de
sobrescribirlo: lo único imprescindible es el bloque `permissions.defaultMode` y
`skipDangerousModePermissionPrompt`.

El modo de permisos **se fija al arrancar la sesión**. Copiar el archivo con Claude Code abierto no
surte efecto hasta reiniciar; para cambiarlo en caliente se usa `shift+tab` en el selector de modo.

## Qué hace esta configuración, y qué no

**`defaultMode: "bypassPermissions"`** — decisión explícita del usuario el 2026-09-11, elegida sobre
la alternativa que preservaba la confirmación de `git push`. No hay diálogos de permiso: ni para
archivos, ni para npm o scripts, ni para git. `skipDangerousModePermissionPrompt` evita que el propio
modo pida confirmación al arrancar, que si no cambiaría un prompt por otro.

**Lo que sí sigue frenando** son las cuatro reglas `deny` de `project-settings.json`
(`rm -rf`, `git reset --hard`, `git clean`, `Remove-Item -Recurse`). No preguntan: **bloquean**. Son
el único candado técnico que queda contra un comando mal formado sobre el working tree, y por eso se
conservaron deliberadamente al pasar a bypass.

**Lo que no es un permiso** es la metodología de CLAUDE.md —propongo → preguntas → plan → «procede»—
y la regla de no hacer commit ni push por iniciativa propia. Esas son reglas de comportamiento y
siguen vigentes con el bypass puesto: que `git push` ya no pida confirmación técnica no significa que
se ejecute sin que lo pidas.

## El hook `SessionStart`

Va dentro de `project-settings.json`. Al abrir sesión corre `git fetch` y, si la rama está por
detrás o por delante del remoto, lo informa. No hace `pull` ni `push` por su cuenta — solo avisa.

El riesgo real de trabajar en dos máquinas no es olvidar el `pull`: es olvidar el `push`. Al día
siguiente se arranca sobre código viejo y aparecen dos `main` divergentes que hay que mezclar a mano.

## Mantener esto al día

Si cambias la configuración en una máquina, **vuelve a copiarla aquí y commitea**. Estas plantillas
no se sincronizan solas; si se quedan atrás, la otra máquina hereda una configuración vieja sin que
nada lo avise.
