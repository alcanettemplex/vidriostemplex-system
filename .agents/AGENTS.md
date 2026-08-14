# Reglas del Proyecto: vidrios-templex-system

## 🔄 REGLA DE ORO — Sincronización Git (OBLIGATORIA)

**Antes de ejecutar CUALQUIER instrucción del usuario**, verificar y sincronizar el estado del repositorio Git.

### Procedimiento obligatorio al inicio de cada sesión o tarea:

1. **Verificar si hay cambios remotos pendientes** ejecutando:
   ```bash
   git fetch origin
   git status
   git log HEAD..origin/main --oneline
   ```

2. **Si existen commits remotos que no están en local** → ejecutar `git pull origin main` automáticamente antes de proceder.

3. **Si el working tree tiene cambios sin commitear** → notificar al usuario antes de hacer pull para evitar conflictos.

4. **Siempre informar al usuario** el resultado del estado Git al inicio (si está al día, si se hizo pull, o si hay conflictos pendientes).

### Regla de cierre (recordar al usuario):

Al finalizar cada sesión de trabajo, recordar al usuario que debe ejecutar:
```bash
git add .
git commit -m "descripción de los cambios"
git push origin main
```
Para que los cambios queden disponibles desde cualquier otra PC.

### Repositorio remoto:
- **Origin**: https://github.com/alcanettemplex/vidriostemplex-system.git
- **Rama principal**: `main`

---

> Esta regla existe porque el usuario trabaja desde múltiples equipos (casa y trabajo)
> y necesita garantizar que siempre trabaja con la versión más reciente del código.
