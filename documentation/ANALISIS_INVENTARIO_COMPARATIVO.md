# 📊 Análisis Comparativo — Inventario Perfilería
**Fecha:** 2026-04-12 | **Excel:** Hoja INV | **DB:** inventario_perfileria

---

## 🔢 Resumen Ejecutivo

| Métrica | Valor |
|---|---|
| Registros físicos en Supabase | **542 barras** |
| Códigos únicos en Supabase | **255** |
| Registros en Excel (hoja INV) | **566 barras** |
| Códigos únicos en Excel | **269** |
| ✅ Coinciden en ambos | **241 códigos** |
| 🆕 En Excel, **faltan en DB** | **28 códigos nuevos** |
| ⚠️ En DB, **no están en Excel** | **14 códigos huérfanos** |
| 🔄 Coinciden pero **stock diferente** | **42 códigos** |

---

## 🆕 28 Códigos NUEVOS — Están en Excel, faltan en DB

> Son items que físicamente existen en bodega pero no están registrados en Supabase.

| Código | Descripción | Color | Barras | Metros |
|---|---|---|---|---|
| ADA0201 | 8025 ADAPTADOR 158 GRIS PLATA | GRIS PLATA | 1 | 1.900 |
| ALF0605 | ALFAJIA S-012 NEGRO | NEGRO | 1 | 0.700 |
| ESQ0604 | 3831 ESQUINERO 416 NEGRO | NEGRO | 1 | 2.400 |
| HOI0101 | 744 HORIZONTAL INFERIOR 390 MATE | MATE | 1 | 0.700 |
| HOI0204 | 744 HORIZONTAL INFERIOR 390 GRIS PLATA | GRIS PLATA | 1 | 0.900 |
| HOI0503 | 744 HORIZONTAL INFERIOR 390 BRONCE | BRONCE | 1 | 0.500 |
| HOI0505 | 8025 HORIZONTAL INFERIOR 157 BRONCE | BRONCE | 1 | 0.900 |
| HOI0602 | 8025 HORIZONTAL INFERIOR 157 NEGRO | NEGRO | 1 | 2.500 |
| HOI0606 | 744 HORIZONTAL INFERIOR 390 NEGRO | NEGRO | 1 | 1.800 |
| HOR0603 | 5020 HORIZONTAL 148 NEGRO | NEGRO | 1 | 0.800 |
| HORS061 | 8025 HORIZONTAL SUPERIOR 156 NEGRO | NEGRO | 1 | 1.100 |
| HOS0503 | 744 HORIZONTAL SUPERIOR 389 BRONCE | BRONCE | 2 | 1.100 |
| JAM0101 | 3831 JAMBA 174 BRONCE | BRONCE | 1 | 1.200 |
| JAM0505 | 744 JAMBA 393 BRONCE | BRONCE | 1 | 1.700 |
| JAM0605 | 5020 JAMBA 193 NEGRO | NEGRO | 1 | 2.100 |
| NAV0503 | 3831 NAVE 176 BRONCE | BRONCE | 1 | 0.900 |
| PIS0601 | 3831 PISAVIDRIO 435 NEGRO | NEGRO | 1 | 1.400 |
| RDU0601 | RIEL DUCASSE 1764 NEGRO | NEGRO | 1 | 2.000 |
| SIL0101 | SILLAR CABINA S-201 MATE | MATE | 1 | 0.700 |
| SIL0203 | 3831 SILLAR CABEZAL 173 GRIS PLATA | GRIS PLATA | 1 | 1.500 |
| SIL0510 | 8025 SILLAR 150 BRONCE | BRONCE | 1 | 1.300 |
| SIL0603 | 5020 SILLAR 194 NEGRO | NEGRO | 1 | 0.700 |
| TRA0103 | 5020 TRASLAPE 192 MATE | MATE | 1 | 5.000 |
| TRA0203 | 744 TRASLAPE 388 BRONCE | BRONCE | 1 | 4.000 |
| TUB0105 | TUBULAR T-94 MATE | MATE | 1 | 2.200 |
| TUB0506 | TUBULAR T-94 BRONCE | BRONCE | 1 | 1.000 |
| U570201 | U57 GRIS PLATA | GRIS PLATA | 3 | 6.480 |
| U680501 | U68 BRONCE | BRONCE | 1 | 6.000 |

---

## ⚠️ 14 Códigos HUÉRFANOS — En DB pero no en Excel

> Pueden ser items que se consumieron, fueron reubicados o son errores de carga.

| Código | Barras en DB | Metros en DB |
|---|---|---|
| CAB0604 | 1 | 6.000 |
| DIV0604 | 2 | 9.100 |
| ENG0505 | 1 | 0.900 |
| HOR0101 | 1 | 0.700 |
| JAM0108 | 1 | 1.000 |
| JAM0503 | 5 | 12.500 |
| P180601 | 1 | 4.200 |
| PIS0602 | 2 | 12.000 |
| PPR0101 | 3 | 5.800 |
| SIL0102 | 6 | 8.200 |
| SIL0609 | 1 | 6.000 |
| TUB0302 | 2 | 11.200 |
| U320101 | 1 | 6.000 |
| U320201 | 1 | 3.100 |

---

## 🔄 42 Códigos con DIFERENCIA DE STOCK

> Existen en ambos lados pero la cantidad de metros no coincide.

| Código | Barras XLS | Metros XLS | Barras DB | Metros DB | Diferencia |
|---|---|---|---|---|---|
| ADA0504 | 1 | 3.600 | 1 | 4.500 | **-0.900** |
| ALF0111 | 2 | 1.900 | 1 | 1.100 | +0.800 |
| CAB0207 | 4 | 6.300 | 3 | 3.700 | +2.600 |
| DIV0101 | 5 | 7.700 | 3 | 3.300 | +4.400 |
| ENG0503 | 7 | 10.500 | 4 | 6.400 | +4.100 |
| JAM0604 | 4 | 3.400 | 3 | 12.700 | **-9.300** |
| NAV0606 | 1 | 3.500 | 6 | 8.400 | **-4.900** |
| PER0103 | 3 | 12.500 | 4 | 18.500 | **-6.000** |
| ROS0602 | 1 | 3.000 | 3 | 9.500 | **-6.500** |
| SIL0103 | 7 | 10.900 | 1 | 6.000 | +4.900 |
| SIL0606 | 5 | 29.140 | 3 | 23.940 | +5.200 |
| TUB0103 | 6 | 10.100 | 2 | 2.100 | **+8.000** |
| TUB0610 | 11 | 11.800 | 15 | 17.400 | **-5.600** |
| U680101 | 3 | 18.000 | 5 | 25.900 | **-7.900** |
| *(+28 más)* | | | | | |

---

## 🎯 Plan de Acción Recomendado

### Opción 1 — Reemplazo total (más simple, recomendada)
```sql
-- Limpiar DB y recargar con los datos exactos del Excel
TRUNCATE TABLE inventario_perfileria RESTART IDENTITY;
-- Luego ejecutar el INSERT del archivo database/inventario_perfileria.sql
```

### Opción 2 — Carga incremental (solo agregar los 28 nuevos)
Solo insertar los 28 códigos que faltan sin tocar los existentes.
Útil si los datos de DB son más actuales que el Excel.

### Opción 3 — Sincronización inteligente (más completa)
1. Insertar los 28 códigos nuevos del Excel
2. Revisar manualmente los 14 huérfanos (puede que se hayan vendido)
3. Actualizar stock en los 42 con diferencias usando el Excel como fuente de verdad

---

> **Fuente de verdad recomendada:** El Excel (conteo físico de bodega Feb 2026)
