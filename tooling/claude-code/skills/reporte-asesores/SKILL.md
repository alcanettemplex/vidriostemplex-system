---
name: reporte-asesores
description: Mensaje diario de pendientes de los asesores comerciales para el grupo de WhatsApp de Vidrios Templex (leads sin asignar, sin contactar o sin seguimiento; ODP sin FE o sin pago). Usar cuando el usuario pida el reporte, los pendientes o el mensaje del día de los asesores, o de un asesor en particular.
allowed-tools: Bash(npm --prefix backend-api run reporte:asesores*)
---

# Reporte diario de asesores

El reporte ya está programado. **No explores el repositorio, no leas controladores ni
modelos, no armes consultas SQL.** Todo sale de un solo comando, con las mismas reglas
que el botón "Reporte del Día" de Supervisión CRM.

## Paso único

Desde la raíz del repo (sin `cd`):

```bash
npm --prefix backend-api run reporte:asesores --silent
```

Variantes (los argumentos van después de `--`):

| Pedido del usuario | Comando |
|---|---|
| Uno o varios asesores | `npm --prefix backend-api run reporte:asesores --silent -- --asesor "paola,nataly"` (busca por parte del nombre, sin tildes) |
| Solo lo que no se ha enviado hoy | `... -- --nuevos` |
| Analizar / contar / comparar | `... -- --json` (datos estructurados por responsable) |

Tarda unos 15 s (compila TypeScript y consulta la BD de producción, solo lectura).

## Qué entregar

- Pega el mensaje **tal cual** en un bloque de código para que el usuario lo copie a WhatsApp.
  No lo resumas, no lo reescribas ni le quites líneas, salvo que el usuario lo pida.
- Si el usuario pide ajustes de redacción, edita sobre ese texto.
- Una línea final, no más: recuérdale que para **registrar el envío** (y medir si cada
  pendiente se resolvió) debe usar el botón "Copiar y registrar envío" del ERP. Este comando
  no escribe nada en la BD.

## Si pregunta por qué algo sale (o no sale)

Lee **solo** `backend-api/src/utils/reporteAsesores.ts` (reglas, comentario inicial) y, si
hace falta, `backend-api/src/utils/diasHabiles.ts` (horario hábil y festivos). Las reglas en
resumen:

- Leads (excluye FRÍO y "No responde"): sin asignar > 2 h hábiles desde la creación (va a la
  asistente administrativa); NUEVO/ASIGNADO sin contacto > 2 h hábiles desde la asignación;
  EN_CONTACTO/COTIZANDO/SEGUIMIENTO/VISITA_TECNICA con ≥ 2 días hábiles sin actividad.
- ODP (solo tipo ODP: sin OA, garantías, NC ni "sin ítems"): LISTO_INSTALAR/PROGRAMADA sin FE;
  INSTALANDO/INSTALADA/ENTREGADA sin FE; con FE y caja PENDIENTE/ABONADO/CREDITO_APROBADO
  con saldo (`valor_total − abono`) > 0.
- Horario hábil: L-V 8-17, sábado 8-12, sin domingos ni festivos de Colombia.

Detalle completo en `docs/modulos/supervision-crm.md`.

## Si falla

Muestra el error tal cual. Causas típicas: sin red hacia Supabase, o `backend-api/.env`
ausente en esta máquina. No intentes reparar el código sin que el usuario lo pida.
