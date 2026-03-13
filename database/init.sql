-- Script de creación de tablas para Vidrios Templex (PostgreSQL / Supabase)

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol VARCHAR(30) NOT NULL CHECK (rol IN ('admin','gerencia','jefe_produccion','asesor_comercial','produccion','auxiliar_produccion','instalador','contabilidad')),
  nombre_completo VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE,
  celular VARCHAR(20),
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  nombre_razon_social VARCHAR(100) NOT NULL,
  cedula_nit VARCHAR(30) NOT NULL UNIQUE,
  direccion VARCHAR(200),
  telefono VARCHAR(20),
  email VARCHAR(100),
  segmento VARCHAR(50),
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS odp (
  id SERIAL PRIMARY KEY,
  numero_odp VARCHAR(30) NOT NULL UNIQUE,
  cliente_id INT NOT NULL REFERENCES clientes(id),
  asesor_id INT NOT NULL REFERENCES usuarios(id),
  
  -- Estados independientes del flujo
  estado_produccion VARCHAR(30) NOT NULL DEFAULT 'EN_ESPERA'
    CHECK (estado_produccion IN ('EN_ESPERA','MEDICION','PEDIDO_PROVEEDOR','ALUMINIO_CORTADO','VIDRIO_RECIBIDO','ACCESORIOS_SEPARADOS','LISTO_INSTALAR','PROGRAMADA','INSTALADA','ENTREGADA')),
  estado_facturacion VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado_facturacion IN ('PENDIENTE','FACTURADA')),
  estado_caja VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado_caja IN ('PENDIENTE','ABONADO','CANCELADO','CREDITO_APROBADO')),

  -- Datos de facturación
  factura_electronica VARCHAR(50),
  url_documento_factura TEXT,

  -- Autorización especial
  autorizacion_especial_despacho BOOLEAN DEFAULT FALSE,
  observacion_autorizacion TEXT,

  -- Datos de entrega
  fecha_entrega DATE,
  nombre_recibe VARCHAR(100),
  telefono_recibe VARCHAR(20),
  direccion_instalacion VARCHAR(200),

  -- Detalle del pedido
  cantidad_total INT DEFAULT 1,
  tipo_servicio VARCHAR(50),
  descripcion_pedido TEXT,
  servicios_detalle JSONB,
  observaciones TEXT,
  croquis_url TEXT,

  -- Opciones de servicio
  matizado BOOLEAN DEFAULT FALSE,
  pelicula BOOLEAN DEFAULT FALSE,
  acarreo BOOLEAN DEFAULT FALSE,
  instalacion BOOLEAN DEFAULT FALSE,
  huacal BOOLEAN DEFAULT FALSE,
  carton BOOLEAN DEFAULT FALSE,

  -- Datos financieros
  forma_pago VARCHAR(50),
  abono NUMERIC(12,2) DEFAULT 0,
  pendiente NUMERIC(12,2) DEFAULT 0,

  -- Proveedor
  proveedor_vidrio VARCHAR(100),
  numero_pedido_proveedor VARCHAR(50),

  -- Checks de producción
  chk_medicion BOOLEAN DEFAULT FALSE,
  chk_corte BOOLEAN DEFAULT FALSE,
  chk_vidrio BOOLEAN DEFAULT FALSE,
  chk_accesorios BOOLEAN DEFAULT FALSE,

  -- Evidencia de instalación
  foto_instalacion_url TEXT,

  fecha_creacion TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS odp_items (
  id SERIAL PRIMARY KEY,
  odp_id INT NOT NULL REFERENCES odp(id) ON DELETE CASCADE,
  item VARCHAR(100),
  color VARCHAR(30),
  espesor VARCHAR(10),
  cantidad INT DEFAULT 1,
  ancho_mm INT,
  alto_mm INT,
  tipo_vidrio VARCHAR(20),
  pelicula BOOLEAN DEFAULT FALSE,
  matizado BOOLEAN DEFAULT FALSE,
  carton BOOLEAN DEFAULT FALSE,
  huacal BOOLEAN DEFAULT FALSE,
  accesorios VARCHAR(255),
  pulidos VARCHAR(50),
  perforaciones INT DEFAULT 0,
  boquetes INT DEFAULT 0,
  descuentos VARCHAR(100),
  otros VARCHAR(255),
  mts_pt_a VARCHAR(20),
  mts_pt_h VARCHAR(20),
  verificacion_prod BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS evidencias_instalacion (
  id SERIAL PRIMARY KEY,
  odp_id INT NOT NULL REFERENCES odp(id) ON DELETE CASCADE,
  instalador_id INT NOT NULL REFERENCES usuarios(id),
  tipo_evidencia VARCHAR(20) NOT NULL CHECK (tipo_evidencia IN ('foto','video','firma')),
  archivo_url TEXT NOT NULL,
  fecha TIMESTAMPTZ DEFAULT NOW(),
  gps VARCHAR(100),
  hash VARCHAR(255),
  datos_firmante VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS vehiculos (
  id SERIAL PRIMARY KEY,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('moto','camion')),
  placa VARCHAR(20) NOT NULL UNIQUE,
  estado VARCHAR(30) DEFAULT 'disponible'
);

CREATE TABLE IF NOT EXISTS programacion_instalaciones (
  id SERIAL PRIMARY KEY,
  odp_id INT NOT NULL REFERENCES odp(id) ON DELETE CASCADE,
  instalador_id INT NOT NULL REFERENCES usuarios(id),
  vehiculo_id INT NOT NULL REFERENCES vehiculos(id),
  fecha_instalacion DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS historial_estados_odp (
  id SERIAL PRIMARY KEY,
  odp_id INT NOT NULL REFERENCES odp(id) ON DELETE CASCADE,
  estado_anterior VARCHAR(30),
  estado_nuevo VARCHAR(30),
  usuario_id INT NOT NULL REFERENCES usuarios(id),
  fecha TIMESTAMPTZ DEFAULT NOW()
);

-- Bloque B: SAP, Cotizaciones, Toma de Medidas

CREATE TABLE IF NOT EXISTS sap (
  id SERIAL PRIMARY KEY,
  odp_id INT NOT NULL REFERENCES odp(id) ON DELETE CASCADE,
  creado_por INT NOT NULL REFERENCES usuarios(id),
  fecha_creacion TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sap_items (
  id SERIAL PRIMARY KEY,
  sap_id INT NOT NULL REFERENCES sap(id) ON DELETE CASCADE,
  descripcion TEXT,
  cantidad INT DEFAULT 1,
  precio_unitario NUMERIC(12,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cotizaciones (
  id SERIAL PRIMARY KEY,
  odp_id INT NOT NULL REFERENCES odp(id) ON DELETE CASCADE,
  creado_por INT NOT NULL REFERENCES usuarios(id),
  total NUMERIC(12,2) DEFAULT 0,
  fecha_creacion TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS toma_medidas (
  id SERIAL PRIMARY KEY,
  odp_id INT NOT NULL REFERENCES odp(id) ON DELETE CASCADE,
  realizado_por INT NOT NULL REFERENCES usuarios(id),
  datos JSONB,
  fecha_creacion TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_odp_cliente ON odp(cliente_id);
CREATE INDEX IF NOT EXISTS idx_odp_asesor ON odp(asesor_id);
CREATE INDEX IF NOT EXISTS idx_odp_estado_prod ON odp(estado_produccion);
CREATE INDEX IF NOT EXISTS idx_odp_fecha_entrega ON odp(fecha_entrega);
CREATE INDEX IF NOT EXISTS idx_odp_items_odp ON odp_items(odp_id);
CREATE INDEX IF NOT EXISTS idx_historial_odp ON historial_estados_odp(odp_id);
