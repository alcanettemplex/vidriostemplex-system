# tasks/lessons.md — Lecciones aprendidas

> Actualizar después de CUALQUIER corrección del usuario.
> Formato: fecha · contexto · error cometido · regla derivada

---

## Patrones de error conocidos

### [2026-04-09] Módulo Toma de Medidas
- **Error:** Avanzar estado ODP en momento incorrecto del flujo modal
- **Regla:** Leer `feedback_tm_flow.md` antes de tocar cualquier lógica de TomaMedidas

### [2026-04-04] Modelo Usuario — CHECK CONSTRAINT
- **Error:** Agregar rol nuevo sin actualizar el CHECK CONSTRAINT de PostgreSQL
- **Regla:** Al agregar rol: (1) ALTER TYPE enum, (2) DROP + recrear CHECK CONSTRAINT en Supabase

### [2026-04-04] Sequelize sync vs ALTER TABLE
- **Error:** Asumir que `sync({ alter: true })` agrega columnas a tablas existentes
- **Regla:** Siempre generar `ALTER TABLE` manual en Supabase; sync solo crea tablas nuevas

### General — Importación de modelos
- **Error:** Importar modelo directamente desde su archivo individual
- **Regla:** SIEMPRE importar desde `models/index.ts` para tener asociaciones cargadas

---

## Protocolo de verificación pre-entrega

Antes de marcar cualquier tarea como completada:
1. ¿Compila sin errores TypeScript?
2. ¿El backend responde en el endpoint afectado?
3. ¿El frontend renderiza sin errores de consola?
4. ¿La lógica de negocio cubre los casos borde definidos?
5. ¿Un Staff Engineer aprobaría este código?
