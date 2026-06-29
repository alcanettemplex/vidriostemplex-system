-- ============================================================
-- REPORTE DE INCUMPLIMIENTO: Rutas e Instalaciones Pendientes
-- Ejecutar en Supabase SQL Editor
-- Muestra todo lo que está programado y NO se ha completado
-- ============================================================


-- ──────────────────────────────────────────────────────────
-- PARTE 1: RESUMEN EJECUTIVO POR RUTA
-- Una fila por ruta — cuántas paradas faltan, días de atraso
-- ──────────────────────────────────────────────────────────
WITH ayudantes AS (
  SELECT
    ri.ruta_id,
    STRING_AGG(u.nombre_completo, ', ' ORDER BY u.nombre_completo) AS ayudantes
  FROM ruta_instaladores ri
  JOIN usuarios u ON u.id = ri.instalador_id
  GROUP BY ri.ruta_id
),
conteo_paradas AS (
  SELECT
    ro.ruta_id,
    COUNT(*)                                               AS total_odps,
    COUNT(*) FILTER (WHERE ro.estado = 'completada')      AS completadas,
    COUNT(*) FILTER (WHERE ro.estado = 'pendiente')       AS pendientes,
    COUNT(*) FILTER (WHERE ro.estado = 'en_curso')        AS en_curso,
    COUNT(*) FILTER (WHERE ro.estado = 'pausada')         AS pausadas,
    COUNT(*) FILTER (WHERE ro.estado = 'con_dano')        AS con_dano
  FROM ruta_odp ro
  GROUP BY ro.ruta_id
)

SELECT
  -- Identificación de la ruta
  r.id                                                    AS ruta_id,
  r.estado                                                AS estado_ruta,
  r.inicio_ruta::date                                     AS fecha_ruta,

  CASE
    WHEN r.inicio_ruta::date < CURRENT_DATE AND r.estado = 'programada' THEN 'ATRASADA - NUNCA INICIÓ'
    WHEN r.inicio_ruta::date < CURRENT_DATE AND r.estado = 'en_curso'   THEN 'ATRASADA - AÚN EN CURSO'
    WHEN r.inicio_ruta::date = CURRENT_DATE                             THEN 'HOY'
    ELSE 'FUTURA'
  END                                                     AS clasificacion,

  GREATEST(0, CURRENT_DATE - r.inicio_ruta::date)        AS dias_atraso,

  -- Equipo
  v.placa                                                 AS vehiculo,
  v.tipo                                                  AS tipo_vehiculo,
  conductor.nombre_completo                               AS conductor,
  oficial.nombre_completo                                 AS instalador_oficial,
  COALESCE(a.ayudantes, '(sin ayudantes)')                AS ayudantes,

  -- Progreso de paradas
  cp.total_odps,
  cp.completadas,
  cp.pendientes,
  cp.en_curso,
  cp.pausadas,
  cp.con_dano,
  cp.total_odps - cp.completadas                          AS odps_sin_completar,

  r.observaciones

FROM rutas_instalacion r
LEFT JOIN vehiculos        v         ON v.id         = r.vehiculo_id
LEFT JOIN usuarios         conductor ON conductor.id = r.conductor_id
LEFT JOIN usuarios         oficial   ON oficial.id   = r.oficial_id
LEFT JOIN ayudantes        a         ON a.ruta_id    = r.id
LEFT JOIN conteo_paradas   cp        ON cp.ruta_id   = r.id

WHERE r.estado IN ('programada', 'en_curso')
  AND (cp.total_odps - COALESCE(cp.completadas, 0)) > 0   -- Tiene algo sin completar

ORDER BY
  CASE r.estado WHEN 'en_curso' THEN 1 WHEN 'programada' THEN 2 END,
  dias_atraso DESC,
  r.inicio_ruta ASC;


-- ──────────────────────────────────────────────────────────
-- PARTE 2: DETALLE POR INSTALACIÓN (UNA FILA POR ODP)
-- Para ver exactamente qué falta por instalación/parada
-- ──────────────────────────────────────────────────────────
WITH ayudantes AS (
  SELECT
    ri.ruta_id,
    STRING_AGG(u.nombre_completo, ', ' ORDER BY u.nombre_completo) AS ayudantes
  FROM ruta_instaladores ri
  JOIN usuarios u ON u.id = ri.instalador_id
  GROUP BY ri.ruta_id
)

SELECT
  -- Identificación
  r.id                                                    AS ruta_id,
  r.estado                                                AS estado_ruta,
  r.inicio_ruta::date                                     AS fecha_ruta,
  GREATEST(0, CURRENT_DATE - r.inicio_ruta::date)        AS dias_atraso,

  -- Parada en la ruta
  ro.orden                                                AS num_parada,
  ro.fecha_programada::date                               AS fecha_parada,
  ro.estado                                               AS estado_parada,

  CASE
    WHEN ro.estado = 'pendiente' AND ro.fecha_programada::date < CURRENT_DATE THEN 'NO INICIADA (VENCIDA)'
    WHEN ro.estado = 'pendiente'                                               THEN 'PENDIENTE'
    WHEN ro.estado = 'en_curso'                                                THEN 'EN PROCESO'
    WHEN ro.estado = 'pausada'                                                 THEN 'PAUSADA'
    WHEN ro.estado = 'con_dano'                                                THEN 'CON DAÑO'
  END                                                     AS descripcion_estado,

  ro.motivo_pausa,
  ro.descripcion_dano,

  -- ODP
  odp.numero_odp,
  odp.descripcion_pedido                                  AS descripcion_trabajo,
  odp.direccion_instalacion,
  odp.estado_produccion,
  odp.estado_caja,
  odp.forma_pago,
  CASE odp.es_garantia WHEN true THEN 'SÍ' ELSE 'NO' END AS es_garantia,

  -- Cliente
  c.nombre_razon_social                                   AS cliente,
  c.telefono                                              AS telefono_cliente,

  -- Asesor
  asesor.nombre_completo                                  AS asesor,

  -- Equipo asignado
  v.placa                                                 AS vehiculo,
  v.tipo                                                  AS tipo_vehiculo,
  conductor.nombre_completo                               AS conductor,
  oficial.nombre_completo                                 AS instalador_oficial,
  COALESCE(a.ayudantes, '(sin ayudantes)')                AS ayudantes,

  -- Tiempos registrados
  ro.inicio_instalacion,
  ro.fin_instalacion

FROM rutas_instalacion r
LEFT JOIN vehiculos   v         ON v.id         = r.vehiculo_id
LEFT JOIN usuarios    conductor ON conductor.id = r.conductor_id
LEFT JOIN usuarios    oficial   ON oficial.id   = r.oficial_id
LEFT JOIN ayudantes   a         ON a.ruta_id    = r.id
JOIN ruta_odp         ro        ON ro.ruta_id   = r.id
JOIN odp                        ON odp.id       = ro.odp_id
LEFT JOIN clientes    c         ON c.id         = odp.cliente_id
LEFT JOIN usuarios    asesor    ON asesor.id    = odp.asesor_id

WHERE
  r.estado IN ('programada', 'en_curso')
  AND ro.estado NOT IN ('completada')

ORDER BY
  dias_atraso DESC,
  r.inicio_ruta ASC,
  r.id,
  ro.orden;


-- ──────────────────────────────────────────────────────────
-- PARTE 3: RANKING DE INCUMPLIMIENTO POR INSTALADOR OFICIAL
-- Para ver quién tiene más pendientes acumulados
-- ──────────────────────────────────────────────────────────
SELECT
  COALESCE(oficial.nombre_completo, '(sin oficial asignado)')  AS instalador_oficial,
  COUNT(DISTINCT r.id)                                          AS rutas_abiertas,
  COUNT(ro.id)                                                  AS total_paradas_pendientes,
  COUNT(ro.id) FILTER (WHERE ro.estado = 'pendiente'
    AND ro.fecha_programada::date < CURRENT_DATE)               AS vencidas_sin_iniciar,
  COUNT(ro.id) FILTER (WHERE ro.estado = 'pausada')             AS pausadas,
  COUNT(ro.id) FILTER (WHERE ro.estado = 'con_dano')            AS con_dano,
  MIN(r.inicio_ruta::date)                                      AS ruta_mas_antigua_pendiente,
  MAX(GREATEST(0, CURRENT_DATE - r.inicio_ruta::date))          AS max_dias_atraso

FROM rutas_instalacion r
LEFT JOIN usuarios  oficial ON oficial.id = r.oficial_id
JOIN ruta_odp ro ON ro.ruta_id = r.id

WHERE r.estado IN ('programada', 'en_curso')
  AND ro.estado NOT IN ('completada')

GROUP BY oficial.nombre_completo
ORDER BY total_paradas_pendientes DESC, max_dias_atraso DESC;


-- ──────────────────────────────────────────────────────────
-- PARTE 4: RANKING POR VEHÍCULO
-- ──────────────────────────────────────────────────────────
SELECT
  COALESCE(v.placa, '(sin vehículo)')                          AS vehiculo,
  v.tipo                                                        AS tipo,
  COUNT(DISTINCT r.id)                                          AS rutas_abiertas,
  COUNT(ro.id)                                                  AS paradas_pendientes,
  MIN(r.inicio_ruta::date)                                      AS fecha_mas_antigua,
  MAX(GREATEST(0, CURRENT_DATE - r.inicio_ruta::date))          AS max_dias_atraso

FROM rutas_instalacion r
LEFT JOIN vehiculos v ON v.id = r.vehiculo_id
JOIN ruta_odp ro ON ro.ruta_id = r.id

WHERE r.estado IN ('programada', 'en_curso')
  AND ro.estado NOT IN ('completada')

GROUP BY v.placa, v.tipo
ORDER BY paradas_pendientes DESC;
