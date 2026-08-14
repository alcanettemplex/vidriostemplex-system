# Proyecto: Agente Supervisor de Asesores Comerciales

**Estado actual:** ✅ Implementado — Pendiente de vincular WhatsApp y configurar PM2.

## 📌 Objetivo

Agente automatizado que se ejecuta cada 2 horas (8 AM - 6 PM, L-V) revisando el estado de los leads asignados a los asesores comerciales. Envía un reporte personalizado a cada asesor por WhatsApp recordándoles:
- Qué leads nuevos o asignados deben contactar urgentemente.
- Qué leads tienen en estado "Cotizando".
- A qué leads deben hacerle "Seguimiento".
- **Nivel 2 (IA):** Si un lead lleva 2+ ciclos (4h) sin atención, genera un mensaje firme con OpenAI.

> **Regla de Negocio:** El agente es estrictamente **emisor (Push)**. No lee ni responde mensajes de los asesores.

---

## 🏗 Arquitectura Final Implementada

```
PC Local (Windows) — PM2 cron cada 2h
        │
        ▼
agente_supervisor_leads.ts   ←── memoria_agente.json (estado local)
        │                               │
        ├── Consulta BD (Supabase)      │
        ├── Lee/escribe memoria ────────┘
        ├── ia.service.ts  ──────── OpenAI gpt-4o-mini (mensajes dinámicos)
        └── whatsapp.service.ts ─── WhatsApp Web local (whatsapp-web.js)
```

### Lógica de Niveles de Alerta

| Nivel | Condición | Mensaje |
|-------|-----------|---------|
| **Nivel 1** (normal) | Lead activo en el ciclo actual | Reporte motivador generado por IA |
| **Nivel 2** (urgente) | Lead ≥ 2 ciclos seguidos sin respuesta | Mensaje firme y directo generado por IA |

---

## 📁 Archivos del Proyecto

| Archivo | Descripción |
|---------|-------------|
| `backend-api/src/scripts/agente_supervisor_leads.ts` | **Script principal.** Orquesta todo: consulta BD, lee memoria, llama a IA y envía por WhatsApp. |
| `backend-api/src/services/whatsapp.service.ts` | Inicializa el cliente de WhatsApp Web local, genera QR y envía mensajes. |
| `backend-api/src/services/ia.service.ts` | Genera mensajes con OpenAI. Dos funciones: `generarReportePeriodico` y `generarMensajeUrgente`. |
| `backend-api/src/scripts/memoria_agente.ts` | Lee y escribe `memoria_agente.json` (historial de alertas por lead). |
| `backend-api/ecosystem.config.json` | Configuración de PM2. Cron: `0 8,10,12,14,16 * * 1-5` (L-V, 8/10/12/14/16h). |
| `backend-api/logs/` | Carpeta de logs generados por PM2. |

---

## 🔑 Variables de Entorno Requeridas

En el archivo `backend-api/.env`:

```env
# Ya existentes:
DATABASE_URL=...

# NUEVO — Agente Supervisor:
OPENAI_API_KEY=sk-TU_CLAVE_REAL_AQUI
```

---

## 🗄 Base de Datos — Cambios Aplicados

La columna `telefono_whatsapp` fue agregada a la tabla `usuarios`:

```sql
ALTER TABLE usuarios ADD COLUMN telefono_whatsapp VARCHAR(20);
```

Para registrar los números de los asesores (formato: código de país + número, sin `+`):

```sql
UPDATE usuarios SET telefono_whatsapp = '5215512345678' WHERE nombre_completo ILIKE '%alejandro%';
UPDATE usuarios SET telefono_whatsapp = '5215598765432' WHERE nombre_completo ILIKE '%paolo%';
UPDATE usuarios SET telefono_whatsapp = '5215511223344' WHERE nombre_completo ILIKE '%nataly%';
```

> El agente consulta dinámicamente el campo `telefono_whatsapp` de todos los usuarios con `rol = 'asesor_comercial'` y `activo = true`. No requiere cambiar el código para agregar más asesores en el futuro.

---

## 🚀 Pasos Pendientes para Poner en Marcha

### Paso 1 — Agregar API Key de OpenAI
Editar `backend-api/.env` y reemplazar el placeholder:
```
OPENAI_API_KEY=sk-TU_CLAVE_REAL_AQUI
```

### Paso 2 — Registrar números de asesores en BD
Ejecutar los UPDATE de SQL indicados arriba con los números reales.

### Paso 3 — Vincular WhatsApp (solo una vez)
```powershell
cd "C:\...\backend-api"
npx ts-node test_whatsapp.ts
```
Escanear el código QR que aparece en la consola con el celular del bot. La sesión queda guardada en `backend-api/.wwebjs_auth/`.

### Paso 4 — Prueba manual del agente
```powershell
npx ts-node src/scripts/agente_supervisor_leads.ts
```
Verificar que los mensajes lleguen a los asesores por WhatsApp.

### Paso 5 — Activar con PM2
```powershell
pm2 start ecosystem.config.json
pm2 save
pm2 startup
```
El comando `pm2 startup` genera un comando que debes copiar y ejecutar como administrador para que PM2 arranque automáticamente al iniciar Windows.

### Paso 6 — Verificar que PM2 esté corriendo
```powershell
pm2 list
pm2 logs agente-supervisor-leads
```

---

## 🔧 Tecnologías Usadas

- **Runtime:** Node.js + TypeScript (ts-node)
- **WhatsApp:** `whatsapp-web.js` v1.34+ con `LocalAuth` (sesión persistente sin QR repetido)
- **IA:** OpenAI `gpt-4o-mini` (costo muy bajo, ~$0.0001 por mensaje)
- **Gestor de procesos:** PM2 (cron schedule, logs automáticos, autorestart al reiniciar Windows)
- **BD:** PostgreSQL en Supabase (acceso por `DATABASE_URL`)
