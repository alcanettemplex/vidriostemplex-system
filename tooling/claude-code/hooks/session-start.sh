#!/usr/bin/env bash
# SessionStart: trae las refs del remoto (git fetch no toca el working tree) e informa el estado
# de sincronización. El usuario trabaja en dos máquinas: el riesgo es arrancar sobre código viejo
# o dejar commits sin pushear. Nunca hace pull: eso lo decide el usuario.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

fetch_ok=1
timeout 20 git fetch --quiet 2>/dev/null || fetch_ok=0

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 0
upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)
dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
behind=0
ahead=0

if [ -n "$upstream" ]; then
  read -r behind ahead < <(git rev-list --left-right --count "$upstream...HEAD" 2>/dev/null)
  msg="git: rama $branch, $behind commit(s) por traer de $upstream, $ahead sin pushear, $dirty archivo(s) con cambios sin commitear."
else
  msg="git: rama $branch sin upstream, $dirty archivo(s) con cambios sin commitear."
fi

[ "$fetch_ok" = 0 ] && msg="$msg El git fetch fallo (sin red o sin credenciales): el estado puede estar desactualizado."
[ "${behind:-0}" -gt 0 ] && msg="$msg Hay commits por traer: avisar al usuario y esperar su orden antes de cualquier pull."
[ "${ahead:-0}" -gt 0 ] && msg="$msg Hay commits sin pushear: recordarselo al usuario."

printf '{"systemMessage":"%s","hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$msg" "$msg"
