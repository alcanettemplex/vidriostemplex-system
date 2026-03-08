-- Script inicial de creación de tablas principales para Vidrios Templex

CREATE TABLE usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('admin','gerencia','jefe_produccion','asesor_comercial','produccion','instalador','contabilidad') NOT NULL,
  nombre_completo VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE clientes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre_razon_social VARCHAR(100) NOT NULL,
  cedula_nit VARCHAR(30) NOT NULL UNIQUE,
  direccion VARCHAR(200),
  telefono VARCHAR(20),
  email VARCHAR(100),
  segmento VARCHAR(50),
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE odp (
  id INT AUTO_INCREMENT PRIMARY KEY,
  numero_odp VARCHAR(30) NOT NULL UNIQUE,
  cliente_id INT NOT NULL,
  asesor_id INT NOT NULL,
  estado ENUM('creada','en_revision','aprobada','en_produccion','lista_entrega','instalada','entregada','facturada','archivada') NOT NULL,
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (asesor_id) REFERENCES usuarios(id)
);

CREATE TABLE odp_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  odp_id INT NOT NULL,
  item VARCHAR(100),
  color VARCHAR(30),
  espesor VARCHAR(10),
  ancho_mm INT,
  alto_mm INT,
  tipo_vidrio VARCHAR(20),
  pelicula BOOLEAN DEFAULT 0,
  matizado BOOLEAN DEFAULT 0,
  carton BOOLEAN DEFAULT 0,
  huacal BOOLEAN DEFAULT 0,
  accesorios VARCHAR(255),
  FOREIGN KEY (odp_id) REFERENCES odp(id)
);

CREATE TABLE evidencias_instalacion (
  id INT AUTO_INCREMENT PRIMARY KEY,
  odp_id INT NOT NULL,
  instalador_id INT NOT NULL,
  tipo_evidencia ENUM('foto','video','firma') NOT NULL,
  archivo_url VARCHAR(255) NOT NULL,
  fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
  gps VARCHAR(100),
  hash VARCHAR(255),
  datos_firmante VARCHAR(255),
  FOREIGN KEY (odp_id) REFERENCES odp(id),
  FOREIGN KEY (instalador_id) REFERENCES usuarios(id)
);

CREATE TABLE vehiculos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tipo ENUM('moto','camion') NOT NULL,
  placa VARCHAR(20) NOT NULL UNIQUE,
  estado VARCHAR(30)
);

CREATE TABLE programacion_instalaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  odp_id INT NOT NULL,
  instalador_id INT NOT NULL,
  vehiculo_id INT NOT NULL,
  fecha_instalacion DATE NOT NULL,
  FOREIGN KEY (odp_id) REFERENCES odp(id),
  FOREIGN KEY (instalador_id) REFERENCES usuarios(id),
  FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id)
);

CREATE TABLE historial_estados_odp (
  id INT AUTO_INCREMENT PRIMARY KEY,
  odp_id INT NOT NULL,
  estado_anterior VARCHAR(30),
  estado_nuevo VARCHAR(30),
  usuario_id INT NOT NULL,
  fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (odp_id) REFERENCES odp(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
