# Configuración de Claude Code

El usuario trabaja en dos máquinas —casa y oficina— y **ninguno de los dos archivos de
configuración viaja por git**: `.claude/` está en `.gitignore` y `~/.claude/` vive fuera del repo.
Esta carpeta existe para que la configuración sí viaje; copiarla sigue siendo un acto manual y
deliberado, porque nada de aquí se aplica solo.

## Los dos archivos

| Plantilla | Copiar a | Qué aporta |
|---|---|---|
| `user-settings.json` | `~/.claude/settings.json` | Modelo, idioma, nivel de esfuerzo y accesos globales |
| `project-settings.json` | `.claude/settings.json` (raíz del repo) | El allowlist de comandos del monorepo (npm, git de lectura, node), las reglas `deny` y el hook `SessionStart` |
| `hooks/session-start.sh` | `.claude/hooks/session-start.sh` | El script que corre el hook |

## Instalación en una máquina nueva

```bash
# desde la raíz del repo
mkdir -p ~/.claude .claude/hooks
cp tooling/claude-code/user-settings.json       ~/.claude/settings.json
cp tooling/claude-code/project-settings.json    .claude/settings.json
cp tooling/claude-code/hooks/session-start.sh   .claude/hooks/session-start.sh
```

El hook y las reglas se cargan al abrir la sesión: tras copiarlos, reiniciar Claude Code o abrir
`/hooks` una vez.

Si ya existe un `~/.claude/settings.json` con cosas propias, **fusiónalo a mano** en vez de
sobrescribirlo.

⚠️ **`user-settings.json` trae rutas de esta máquina** (`C:\Users\User\.claude` en `allow` y
`additionalDirectories`). Si el usuario de Windows de la otra máquina es distinto (por ejemplo
`PRODUCCION`), esas dos líneas hay que ajustarlas a mano con la ruta real — copiarlas tal cual
apuntaría a una carpeta que no existe ahí.

## Qué hace esta configuración, y qué no

No hay `bypassPermissions`: cada máquina confirma sus propios comandos (decisión del usuario del
2026-09-11). `project-settings.json` trae tres cosas:

- **Allowlist** de comandos de desarrollo del monorepo (`npm`, `node`, `git` de solo lectura); todo
  lo demás pide confirmación en el modo por defecto.
- **Reglas `deny`** contra borrar el working tree con un comando mal formado: `rm -rf`,
  `git reset --hard`, `git clean` (también en la forma `git -C <ruta> …`) y `Remove-Item -Recurse`,
  para Bash y PowerShell. No preguntan: bloquean, en cualquier modo de permisos.
- **Hook `SessionStart`**: corre `git fetch` (no toca el working tree) e informa cuántos commits
  hay por traer, cuántos sin pushear y cuántos archivos sin commitear. Nunca hace `pull`. Declara
  `"shell": "bash"` a propósito: en Windows, `bash` desde PowerShell resuelve al de WSL, no al de
  Git Bash.

Reglas `deny` y hook se agregaron el 2026-09-25, a pedido del usuario, al notar que una máquina no
tenía ninguna protección.

**Lo que no es un permiso** es la metodología de CLAUDE.md —propongo → preguntas → plan → «procede»—
y la regla de no hacer commit ni push por iniciativa propia. Esas son reglas de comportamiento,
independientes del modo de permisos configurado.

## Sincronización entre máquinas

El riesgo real de trabajar en dos máquinas no es olvidar el `pull`: es olvidar el `push`. Al día
siguiente se arranca sobre código viejo y aparecen dos `main` divergentes que hay que mezclar a
mano. El hook `SessionStart` lo avisa al abrir sesión; en una máquina sin el hook, revisar
`git fetch` + `git status` es manual.

## Mantener esto al día

Si cambias la configuración en una máquina, **vuelve a copiarla aquí y commitea**. Estas plantillas
no se sincronizan solas; si se quedan atrás, la otra máquina hereda una configuración vieja sin que
nada lo avise.
