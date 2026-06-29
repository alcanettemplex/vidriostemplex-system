'use strict';
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
  ExternalHyperlink, TableOfContents
} = require('docx');
const fs = require('fs');

// ── Helpers ────────────────────────────────────────────────────────────────
const W = 9360; // content width DXA (US Letter 1" margins)
const BLUE = '1F4E79';
const LIGHT_BLUE = 'D6E4F0';
const GRAY = 'F2F2F2';
const DARK_GRAY = '595959';

function h1(text, id) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: true,
    children: [new TextRun({ text, bold: true, size: 36, color: BLUE, font: 'Arial' })],
    spacing: { before: 200, after: 160 },
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun({ text, bold: true, size: 28, color: BLUE, font: 'Arial' })],
    spacing: { before: 280, after: 120 },
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [new TextRun({ text, bold: true, size: 24, color: DARK_GRAY, font: 'Arial' })],
    spacing: { before: 200, after: 80 },
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, font: 'Arial', ...opts })],
    spacing: { after: 100 },
  });
}

function bold(text) { return new TextRun({ text, bold: true, size: 22, font: 'Arial' }); }
function normal(text) { return new TextRun({ text, size: 22, font: 'Arial' }); }
function code(text) {
  return new TextRun({ text, size: 20, font: 'Courier New', color: '2E4057' });
}

function pMixed(...runs) {
  return new Paragraph({ children: runs, spacing: { after: 100 } });
}

function codeBlock(lines) {
  return lines.map(line =>
    new Paragraph({
      children: [code(line)],
      spacing: { before: 0, after: 0 },
      shading: { fill: 'EEF2F7', type: ShadingType.CLEAR },
      indent: { left: 360 },
    })
  );
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'bullets', level },
    children: [new TextRun({ text, size: 22, font: 'Arial' })],
    spacing: { after: 60 },
  });
}

function bulletMixed(runs, level = 0) {
  return new Paragraph({
    numbering: { reference: 'bullets', level },
    children: runs,
    spacing: { after: 60 },
  });
}

function numbered(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'numbers', level },
    children: [new TextRun({ text, size: 22, font: 'Arial' })],
    spacing: { after: 60 },
  });
}

function spacer() {
  return new Paragraph({ children: [new TextRun('')], spacing: { after: 80 } });
}

const borderCell = { style: BorderStyle.SINGLE, size: 1, color: 'BBBBBB' };
const cellBorders = { top: borderCell, bottom: borderCell, left: borderCell, right: borderCell };

function headerRow(cols, widths) {
  return new TableRow({
    tableHeader: true,
    children: cols.map((text, i) =>
      new TableCell({
        borders: cellBorders,
        width: { size: widths[i], type: WidthType.DXA },
        shading: { fill: '1F4E79', type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({
          children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 20, font: 'Arial' })],
          alignment: AlignmentType.CENTER,
        })],
      })
    ),
  });
}

function dataRow(cells, widths, shade = false) {
  return new TableRow({
    children: cells.map((text, i) =>
      new TableCell({
        borders: cellBorders,
        width: { size: widths[i], type: WidthType.DXA },
        shading: { fill: shade ? GRAY : 'FFFFFF', type: ShadingType.CLEAR },
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [new Paragraph({
          children: [typeof text === 'string'
            ? new TextRun({ text, size: 20, font: 'Arial' })
            : text],
          spacing: { after: 0 },
        })],
      })
    ),
  });
}

function table(headerCols, rows, widths) {
  return new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      headerRow(headerCols, widths),
      ...rows.map((row, idx) => dataRow(row, widths, idx % 2 === 1)),
    ],
  });
}

// ── Document ───────────────────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [
      {
        reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }, {
          level: 1, format: LevelFormat.BULLET, text: '\u25E6', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1080, hanging: 360 } } },
        }],
      },
      {
        reference: 'numbers',
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
    ],
  },
  styles: {
    default: { document: { run: { font: 'Arial', size: 22 } } },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: 'Arial', color: BLUE },
        paragraph: { spacing: { before: 200, after: 160 }, outlineLevel: 0 },
      },
      {
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: 'Arial', color: BLUE },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 },
      },
      {
        id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: 'Arial', color: DARK_GRAY },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 },
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [
            new TextRun({ text: 'Manual T\u00E9cnico \u2014 Vidrios Templex ERP', size: 18, font: 'Arial', color: '888888' }),
          ],
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CCCCCC', space: 4 } },
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          children: [
            new TextRun({ text: 'P\u00E1gina ', size: 18, font: 'Arial', color: '888888' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, font: 'Arial', color: '888888' }),
            new TextRun({ text: ' de ', size: 18, font: 'Arial', color: '888888' }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, font: 'Arial', color: '888888' }),
          ],
          alignment: AlignmentType.RIGHT,
        })],
      }),
    },
    children: [
      // ── PORTADA ──────────────────────────────────────────────────────────
      new Paragraph({
        children: [new TextRun({ text: '', size: 72 })],
        spacing: { before: 1440 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'VIDRIOS TEMPLEX', bold: true, size: 56, font: 'Arial', color: BLUE })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Sistema ERP \u2014 Manual T\u00E9cnico', size: 40, font: 'Arial', color: DARK_GRAY })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Versi\u00F3n 1.0 \u2014 Abril 2026', size: 24, font: 'Arial', color: '999999' })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 2880 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Confidencial \u2014 Uso interno', size: 20, font: 'Arial', color: 'AAAAAA', italics: true })],
        alignment: AlignmentType.CENTER,
      }),

      // ── TABLA DE CONTENIDOS ───────────────────────────────────────────────
      new Paragraph({ children: [new PageBreak()] }),
      new TableOfContents('Tabla de Contenidos', { hyperlink: true, headingStyleRange: '1-3' }),

      // ═══════════════════════════════════════════════════════════════════════
      // 1. DESCRIPCI\u00D3N GENERAL
      // ═══════════════════════════════════════════════════════════════════════
      h1('1. Descripci\u00F3n General del Sistema'),
      p('Vidrios Templex ERP es una aplicaci\u00F3n empresarial a medida que gestiona el ciclo completo de operaciones de la empresa: cotizaci\u00F3n \u2192 producci\u00F3n \u2192 instalaci\u00F3n \u2192 facturaci\u00F3n \u2192 cobro. Est\u00E1 organizada como monorepo con tres sub-proyectos independientes.'),

      h2('1.1 Arquitectura General'),
      table(
        ['Sub-proyecto', 'Tecnolog\u00EDas', 'Puerto / Plataforma'],
        [
          ['backend-api', 'Node.js 20 + Express + TypeScript + Sequelize + Socket.io', '3001'],
          ['frontend-web', 'React 19 + MUI v5 + Redux Toolkit + Axios', '3000 (dev)'],
          ['mobile-app', 'Expo + React Native + Expo Router', 'Expo Go / APK'],
        ],
        [2800, 4360, 2200]
      ),
      spacer(),

      h2('1.2 Infraestructura de Producci\u00F3n'),
      bullet('Base de datos: PostgreSQL en Supabase (AWS us-east-1), SSL obligatorio'),
      bullet('Almacenamiento de im\u00E1genes: Cloudinary, carpeta templex_instalaciones'),
      bullet('Frontend: Netlify / Vercel (CI=false para ignorar warnings de build)'),
      bullet('Backend: Docker multi-stage node:20-alpine, puerto 3001'),
      bullet('Reverse proxy: Nginx \u2192 /api/* al backend, SPA routing para el frontend'),
      spacer(),

      h2('1.3 Variables de Entorno'),
      h3('Backend (backend-api/.env)'),
      ...codeBlock([
        'PORT=3001',
        'JWT_SECRET=<secreto_jwt>',
        'DATABASE_URL=postgresql://user:pass@host:5432/db',
        'CLOUDINARY_CLOUD_NAME=...',
        'CLOUDINARY_API_KEY=...',
        'CLOUDINARY_API_SECRET=...',
        'FRONTEND_URL=http://localhost:3000',
      ]),
      spacer(),
      h3('Frontend (frontend-web/.env)'),
      ...codeBlock([
        'REACT_APP_API_URL=http://localhost:3001',
        'CI=false',
      ]),
      spacer(),

      // ═══════════════════════════════════════════════════════════════════════
      // 2. BASE DE DATOS
      // ═══════════════════════════════════════════════════════════════════════
      h1('2. Base de Datos'),
      p('El motor es PostgreSQL administrado en Supabase. Sequelize ORM se usa con sync({ alter: false }) \u2014 solo crea tablas nuevas, nunca agrega columnas a tablas existentes. Toda migraci\u00F3n de esquema requiere ALTER TABLE manual en el SQL editor de Supabase.'),

      h2('2.1 Modelos y Tablas'),
      table(
        ['Modelo', 'Tabla', 'Descripci\u00F3n'],
        [
          ['ODP \u2b50', 'odp', 'Entidad central. Sin timestamps; usa fecha_creacion manual.'],
          ['ODPItem', 'odp_items', '\u00CDtems de aluminio/vidrio de una ODP'],
          ['Cliente', 'clientes', 'Clientes y empresas'],
          ['Usuario', 'usuarios', 'Usuarios con rol RBAC. CHECK CONSTRAINT sobre el campo rol.'],
          ['Cotizacion', 'cotizaciones', 'Cotizaciones pre-ODP'],
          ['TomaMedidas', 'toma_medidas', 'Mediciones (ligada a ODP o Prospecto)'],
          ['SAP', 'saps', 'Solicitud de Aprovisionamiento de Perfilar\u00EDa'],
          ['SAPItem', 'sap_items', '\u00CDtems de aluminio del SAP'],
          ['OrdenCompra', 'ordenes_compra', 'ODC a proveedores (tipo: perfileria | vidrio)'],
          ['ODCItem', 'odc_items', '\u00CDtems de ODC, ligados a SAPItem u ODPItem'],
          ['Pago', 'pagos', 'Registros de abonos y pagos'],
          ['EvidenciaInstalacion', 'evidencias_instalacion', 'Fotos en Cloudinary'],
          ['NoConformidad', 'no_conformidades', 'Reportes de defectos/no conformidades'],
          ['NotaProduccion', 'notas_produccion', 'Notas internas de producci\u00F3n'],
          ['HistorialEstadoODP', 'historial_estados_odp', 'Audit trail de cambios de estado'],
          ['Vehiculo', 'vehiculos', 'Veh\u00EDculos para instalaci\u00F3n'],
          ['RutaInstalacion', 'rutas_instalacion', 'Ruta diaria de instalaciones'],
          ['RutaODP', 'ruta_odps', 'Join RutaInstalacion \u2194 ODP'],
          ['Prospecto', 'prospectos', 'Leads comerciales previos a ODP'],
          ['CatalogoProducto', 'catalogo_productos', 'Cat\u00E1logo de productos/perfiles'],
          ['InventarioPerfileria', 'inventario_perfileria', 'Stock de perfiles de aluminio'],
          ['MetaMensual', 'metas_mensuales', 'Metas mensuales por usuario'],
          ['ConfiguracionGlobal', 'configuracion_global', 'Configuraciones del sistema'],
          ['PedidoPV', 'pedido_pv', 'Pedidos de vidrios templados al proveedor PV'],
          ['SalidaAlmacen', 'salidas_almacen', 'SA-XXXX por ODP facturada; una SA por ODP'],
          ['AuditoriaLog', 'auditoria_log', 'Log global de INSERT/UPDATE/DELETE (25 modelos)'],
          ['AlertasUmbral', 'alertas_umbral', 'Umbrales configurables para alertas ROOT'],
        ],
        [2200, 2600, 4560]
      ),
      spacer(),

      h2('2.2 Migraciones de Esquema'),
      p('IMPORTANTE: Sequelize sync({ alter: false }) NO agrega columnas a tablas existentes. Al agregar campos a modelos existentes se debe ejecutar manualmente:'),
      ...codeBlock([
        '-- Agregar columna nueva:',
        'ALTER TABLE nombre_tabla ADD COLUMN nueva_col VARCHAR(100);',
        '',
        '-- Agregar rol nuevo (tabla usuarios tiene CHECK CONSTRAINT):',
        "ALTER TYPE enum_usuarios_rol ADD VALUE 'nuevo_rol';",
        '-- Luego DROP y recrear el CHECK CONSTRAINT incluyendo el nuevo valor.',
      ]),
      spacer(),

      h2('2.3 Auditor\u00EDa Autom\u00E1tica'),
      p('Los hooks Sequelize en models/index.ts cubren 25 modelos. Cada INSERT/UPDATE/DELETE genera un registro en auditoria_log con:'),
      bullet('tabla, operacion, registro_id'),
      bullet('datos_anteriores / datos_nuevos (JSONB)'),
      bullet('usuario_id, ip_address, fecha'),
      p('El contexto del usuario se inyecta mediante AsyncLocalStorage (requestContext.ts). El hook beforeUpdate guarda instance.previous() en instance._auditAntes antes del update; afterUpdate lo usa para grabar datos_anteriores.'),
      spacer(),

      // ═══════════════════════════════════════════════════════════════════════
      // 3. ENTIDAD ODP
      // ═══════════════════════════════════════════════════════════════════════
      h1('3. Entidad Central: ODP (Orden de Producci\u00F3n)'),
      p('La ODP es el n\u00FAcleo del sistema. Tiene tres m\u00E1quinas de estado independientes que avanzan de forma aut\u00F3noma.'),

      h2('3.1 Estados de Producci\u00F3n'),
      ...codeBlock([
        'EN_ESPERA \u2192 VISITA_TECNICA \u2192 MEDICION \u2192 PEDIDO_PROVEEDOR',
        '\u2192 ALUMINIO_CORTADO \u2192 VIDRIO_RECIBIDO \u2192 ACCESORIOS_SEPARADOS',
        '\u2192 LISTO_INSTALAR \u2192 PROGRAMADA \u2192 INSTALADA \u2192 ENTREGADA',
        '                                          \u21B3 PAUSADA (en cualquier punto)',
      ]),
      spacer(),

      h2('3.2 Estados de Facturaci\u00F3n'),
      ...codeBlock(['PENDIENTE \u2192 FACTURADA']),
      spacer(),

      h2('3.3 Estados de Caja'),
      ...codeBlock(['PENDIENTE \u2192 ABONADO \u2192 CANCELADO',
                    '         \u2192 CREDITO_APROBADO']),
      spacer(),

      h2('3.4 Campos de Progreso (chk_*)'),
      p('La ODP tiene campos booleanos independientes del estado de producci\u00F3n:'),
      bullet('chk_medicion, chk_corte, chk_vidrio, chk_accesorios'),
      bullet('chk_ensamble, chk_matizado, chk_pelicula, chk_huacal, chk_carton'),
      p('Se actualizan individualmente sin afectar el estado_produccion.'),
      spacer(),

      h2('3.5 ODP Derivada (No Conformidad)'),
      p('Al reportar una No_Conformidad, puede generarse una ODP hija con:'),
      bullet('odp_padre_id apuntando a la ODP original'),
      bullet('es_no_conformidad: true'),
      spacer(),

      h2('3.6 ODPItem \u2014 Campos Clave'),
      table(
        ['Campo', 'Valores / Descripci\u00F3n'],
        [
          ['color', 'Select con opciones fijas. Es el campo principal de color.'],
          ['tipo_vidrio', 'Campo libre; se usa cuando color = "Otro"'],
          ['prod', 'Tipo de proceso: CR, PV, LAM, etc.'],
          ['estado_compra', 'pendiente | en_odc | en_existencia (tracking sin SAP)'],
        ],
        [2800, 6560]
      ),
      spacer(),

      // ═══════════════════════════════════════════════════════════════════════
      // 4. ARQUITECTURA BACKEND
      // ═══════════════════════════════════════════════════════════════════════
      h1('4. Arquitectura Backend'),

      h2('4.1 Estructura de Archivos Clave'),
      table(
        ['Archivo', 'Rol'],
        [
          ['app.ts', 'Configura Express, middlewares y rutas. Exporta app.'],
          ['server.ts', 'Punto de entrada. Crea http.Server, adjunta Socket.io, arranca puerto. Exporta emitirNotificacion().'],
          ['socketServer.ts', 'L\u00F3gica de rooms y eventos Socket.io'],
          ['config/database.ts', 'Conexi\u00F3n Sequelize + SSL Supabase'],
          ['config/upload.ts', 'Multer + Cloudinary storage'],
          ['middlewares/authMiddleware.ts', 'Verifica JWT y agrega req.user'],
          ['middlewares/rbacMiddleware.ts', 'Control de acceso por rol'],
          ['utils/requestContext.ts', 'AsyncLocalStorage con userId, userName e ip por request'],
          ['utils/notificaciones.ts', 'notificarCambioEstadoODP() \u2014 importar siempre desde aqu\u00ED'],
          ['models/index.ts', 'Asociaciones centralizadas. Siempre importar modelos desde aqu\u00ED.'],
        ],
        [3200, 6160]
      ),
      spacer(),

      h2('4.2 Patr\u00F3n de Middlewares'),
      p('Todas las rutas protegidas siguen este orden obligatorio:'),
      ...codeBlock(['authMiddleware \u2192 rbacMiddleware \u2192 controller']),
      spacer(),

      h2('4.3 Endpoints de la API (prefijo /api)'),
      table(
        ['Prefijo', 'Controlador', 'Descripci\u00F3n'],
        [
          ['/auth', 'auth.controller', 'Login y refresh de token JWT'],
          ['/usuarios', 'usuario.controller', 'CRUD de usuarios'],
          ['/clientes', 'cliente.controller', 'CRUD de clientes'],
          ['/odp', 'odp.controller', 'CRUD de ODPs y cambios de estado'],
          ['/produccion', 'produccion.controller', 'Control de producci\u00F3n y chk_*'],
          ['/instalaciones', 'instalacion.controller', 'Gesti\u00F3n de instalaciones y programaci\u00F3n'],
          ['/evidencias', 'evidencia.controller', 'Subida/consulta de fotos en Cloudinary'],
          ['/compras', 'odc.controller', 'SAPs, ODCs y vidrios sin SAP'],
          ['/contabilidad', 'contabilidad.controller', 'Facturaci\u00F3n y caja'],
          ['/no-conformidad', 'no_conformidad.controller', 'Reportes de no conformidad'],
          ['/configuracion', 'configuracion.controller', 'Par\u00E1metros globales del sistema'],
          ['/notas-produccion', 'nota_produccion.controller', 'Notas internas'],
          ['/catalogo', 'catalogo.controller', 'Cat\u00E1logo de productos (tambi\u00E9n accesible para root)'],
          ['/prospectos', 'prospecto.controller', 'Pipeline CRM y leads'],
          ['/inventario-perfileria', 'inventario_perfileria.controller', 'Stock de perfiles'],
          ['/rutas', 'rutas.controller', 'Rutas de instalaci\u00F3n diarias'],
          ['/dashboard', 'dashboard.controller', 'KPIs y gr\u00E1ficas resumen'],
          ['/documentos', '(PDF/Excel server-side)', 'Generaci\u00F3n de documentos'],
          ['/pedidos-pv', 'pedido_pv.controller', 'Pedidos de vidrios templados PV'],
          ['/facturas-salidas', 'salidas_almacen.controller', 'Control facturas vs SA-XXXX'],
          ['/root', 'root.controller', 'Panel exclusivo del rol root'],
        ],
        [2400, 2800, 4160]
      ),
      spacer(),

      h2('4.4 Convenciones de C\u00F3digo Backend'),
      bullet('TypeScript estricto ("strict": true). No usar any expl\u00EDcito.'),
      bullet('Solo console.error y console.warn (no console.log).'),
      bullet('Validaci\u00F3n de entrada con Zod en los controladores.'),
      bullet('Transacciones Sequelize para operaciones multi-tabla.'),
      spacer(),

      // ═══════════════════════════════════════════════════════════════════════
      // 5. FLUJOS DE NEGOCIO CLAVE
      // ═══════════════════════════════════════════════════════════════════════
      h1('5. Flujos de Negocio Clave'),

      h2('5.1 Flujo SAP (Solicitud de Aprovisionamiento de Perfilar\u00EDa)'),
      p('El SAP es un documento intermedio entre la ODP y las compras de aluminio:'),
      ...codeBlock([
        'ODP \u2192 SAP \u2192 SAPItem \u2192 OrdenCompra (ODC) \u2192 ODCItem',
      ]),
      bullet('El controlador sap.controller.ts genera la lista de materiales de aluminio.'),
      bullet('Las ODCs de perfilar\u00EDa tienen sap_id asociado.'),
      bullet('Las ODCs de vidrio tienen sap_id=null y usan odc_items.odp_item_id.'),
      spacer(),

      h2('5.2 Flujo Prospectos \u2192 ODP'),
      numbered('El comercial crea un Prospecto (lead).'),
      numbered('Opcionalmente se registra una TomaMedidas al Prospecto (antes de ser ODP).'),
      numbered('Al aprobarse el prospecto, se convierte en ODP. Prospecto.odp_id queda poblado.'),
      spacer(),

      h2('5.3 Flujo PedidoPV (Vidrios Templados)'),
      bullet('Al crear una ODP con proveedor_vidrio, el backend auto-genera un PedidoPV (n\u00FAmero consecutivo, base 6733 si no hay ninguno), fuera de la transacci\u00F3n principal.'),
      bullet('Alejandro (puede_gestionar_pv=true) asigna \u00EDtems de ODP al PedidoPV desde el tab "Por Gestionar".'),
      bullet('Si se seleccionan m\u00E1s de 12 \u00EDtems, se crean extensiones con sufijo -1, -2, etc.'),
      bullet('\u00CDtems no asignados por Alejandro aparecen en el tab "Vidrios" de Compras para gesti\u00F3n directa (ODC sin SAP).'),
      bullet('ODPs sin proveedor_vidrio \u2192 todos sus \u00EDtems de vidrio van directo a Compras.'),
      p('Estados del PedidoPV:'),
      ...codeBlock(['PENDIENTE \u2192 ENVIADO \u2192 CONFIRMADO_PROVEEDOR \u2192 LLEGADO \u2192 VERIFICADO | PROBLEMA']),
      spacer(),

      h2('5.4 Flujo Salidas de Almac\u00E9n'),
      bullet('SalidaAlmacen vincula una ODP facturada con su n\u00FAmero SA (formato SA-XXXX, libre).'),
      bullet('Una sola SA por ODP (UNIQUE en odp_id).'),
      bullet('Al registrar SA, la ODP sale del tab "Facturadas" y pasa a "Con Salidas de Almac\u00E9n".'),
      spacer(),

      h2('5.5 Flujo de Rutas de Instalaci\u00F3n'),
      bullet('RutaInstalacion agrupa m\u00FAltiples ODPs v\u00EDa RutaODP (tabla join).'),
      bullet('Tiene conductor, veh\u00EDculo e instaladores (M:M v\u00EDa tabla ruta_instaladores).'),
      bullet('ODPs con forma_pago="credito" se consideran pago OK para instalaci\u00F3n autom\u00E1ticamente (sin requerir CREDITO_APROBADO).'),
      spacer(),

      h2('5.6 No Conformidad'),
      bullet('Al reportar una No_Conformidad, puede generarse una ODP hija (odp_padre_id, es_no_conformidad=true).'),
      bullet('La ODP hija sigue el mismo flujo de producci\u00F3n que una ODP normal.'),
      spacer(),

      // ═══════════════════════════════════════════════════════════════════════
      // 6. WEBSOCKETS
      // ═══════════════════════════════════════════════════════════════════════
      h1('6. WebSockets (Socket.io)'),
      p('El backend emite eventos en tiempo real. La configuraci\u00F3n vive en server.ts y socketServer.ts.'),

      h2('6.1 Rooms'),
      bullet('Al conectarse, el cliente env\u00EDa join({ userId, rol }).'),
      bullet('El servidor une al cliente a rooms user_{id} y role_{rol}.'),

      h2('6.2 Emisi\u00F3n de Notificaciones'),
      p('Siempre usar el helper centralizado; nunca llamar emitirNotificacion() directamente desde los controladores:'),
      ...codeBlock(["import { notificarCambioEstadoODP } from '../utils/notificaciones';"]),
      bullet('notificarCambioEstadoODP() notifica al asesor de la ODP + roles jefe_produccion y compras al cambiar el estado de producci\u00F3n.'),

      h2('6.3 CORS de WebSocket'),
      p('M\u00E1s restrictivo que el HTTP: solo localhost:3000, FRONTEND_URL, *.netlify.app, *.vercel.app.'),
      spacer(),

      // ═══════════════════════════════════════════════════════════════════════
      // 7. AUTENTICACI\u00D3N Y RBAC
      // ═══════════════════════════════════════════════════════════════════════
      h1('7. Autenticaci\u00F3n y Control de Acceso (RBAC)'),

      h2('7.1 JWT'),
      p('El login genera un token JWT firmado con JWT_SECRET. El authMiddleware lo valida en cada request protegida y agrega req.user.'),

      h2('7.2 Roles'),
      table(
        ['Rol', 'Descripci\u00F3n'],
        [
          ['root', 'Superior a todos. Acceso exclusivo al m\u00F3dulo ROOT. Usuario: ROOT, id=30.'],
          ['admin', 'Administrador general'],
          ['gerencia', 'Acceso a reportes y configuraci\u00F3n estrat\u00E9gica'],
          ['jefe_produccion', 'Supervisa el flujo de producci\u00F3n'],
          ['asesor_comercial', 'Gestiona prospectos y ODPs comerciales'],
          ['produccion', 'Operarios de producci\u00F3n'],
          ['auxiliar_produccion', 'Auxiliar de producci\u00F3n'],
          ['instalador', 'Ejecuta instalaciones en campo'],
          ['conductor', 'Exclusivo del m\u00F3dulo de rutas de instalaci\u00F3n'],
          ['contabilidad', 'Facturaci\u00F3n y caja'],
          ['compras', 'Gestiona ODCs, SAPs y salidas de almac\u00E9n'],
        ],
        [2600, 6760]
      ),
      spacer(),
      p('CRITICO: La tabla usuarios tiene un CHECK CONSTRAINT (usuarios_rol_check) que lista los roles expl\u00EDcitamente. Al agregar un rol nuevo hay que: (1) ALTER TYPE enum_usuarios_rol ADD VALUE; (2) DROP + recrear el CHECK CONSTRAINT.'),

      h2('7.3 Campo Especial: puede_gestionar_pv'),
      p('Booleano en el modelo Usuario. Controla acceso al tab "Por Gestionar" en Pedidos PV. Debe estar definido en el modelo Sequelize o toJSON() no lo incluir\u00E1 en el login.'),
      spacer(),

      // ═══════════════════════════════════════════════════════════════════════
      // 8. ARQUITECTURA FRONTEND
      // ═══════════════════════════════════════════════════════════════════════
      h1('8. Arquitectura Frontend'),

      h2('8.1 Estructura de Features'),
      p('Cada m\u00F3dulo en frontend-web/src/features/<nombre>/ sigue este patr\u00F3n:'),
      bullet('P\u00E1gina principal (ej. ComprasPage.tsx)'),
      bullet('components/ con modales y sub-componentes'),
      bullet('Slice Redux si maneja estado global'),

      h2('8.2 M\u00F3dulos y Rutas'),
      table(
        ['Feature', 'Ruta', 'Descripci\u00F3n'],
        [
          ['auth', '/login', 'Login con JWT'],
          ['odp', '/odp', 'CRUD de ODPs + modal detalle completo'],
          ['produccion', '/produccion', 'Vista Kanban/tabla del estado de producci\u00F3n'],
          ['instalaciones', '/instalaciones', 'Vistas por rol: JefeView, InstaladorView, ConductorView'],
          ['compras', '/compras', 'ODC con tabs: SAPs, \u00D3rdenes, Perfilar\u00EDa, Vidrios'],
          ['contabilidad', '/contabilidad', 'Facturaci\u00F3n y caja'],
          ['clientes', '/clientes', 'CRUD clientes'],
          ['prospectos', '/prospectos', 'Pipeline CRM'],
          ['toma-medidas', '/toma-medidas', 'Gesti\u00F3n de mediciones'],
          ['inventario', '/inventario', 'Inventario de perfilar\u00EDa'],
          ['evidencias', '/evidencias', 'Galer\u00EDa de fotos de instalaci\u00F3n'],
          ['usuarios', '/usuarios', 'Administraci\u00F3n de usuarios'],
          ['pedidos-pv', '/pedidos-pv', 'Gesti\u00F3n de pedidos de vidrios templados PV'],
          ['facturas-salidas', '/facturas-salidas', 'Control interno Facturas vs SA-XXXX'],
          ['reportes', '/reportes', 'Reportes y exportaci\u00F3n'],
          ['configuracion', '/configuracion', 'Configuraci\u00F3n global del sistema'],
          ['root', '/root', 'Panel de control total \u2014 solo rol root'],
        ],
        [2200, 2400, 4760]
      ),
      spacer(),

      h2('8.3 Componentes Clave del M\u00F3dulo ODP'),
      table(
        ['Componente', 'Funci\u00F3n'],
        [
          ['ODPDetailModal.tsx', 'Modal maestro con todos los tabs de una ODP'],
          ['ODPForm.tsx', 'Formulario de creaci\u00F3n/edici\u00F3n de ODP'],
          ['TMModal.tsx', 'Toma de Medidas (dos momentos: antes y despu\u00E9s de ODP)'],
          ['SAPModal.tsx', 'Modal de solicitud de perfilar\u00EDa'],
          ['COTModal.tsx', 'Modal de cotizaci\u00F3n'],
          ['PrintableOP.tsx', 'PDF de Orden de Producci\u00F3n (window.print())'],
          ['PrintableSAP.tsx', 'PDF de SAP (window.print())'],
          ['PrintableProduccion.tsx', 'PDF de hoja de producci\u00F3n (window.print())'],
        ],
        [3200, 6160]
      ),
      spacer(),

      h2('8.4 Estado Global (Redux)'),
      bullet('Store en store/store.ts con slices por feature'),
      bullet('Notificaciones en tiempo real v\u00EDa useSocketNotifications hook'),
      bullet('socket.ts configura la conexi\u00F3n Socket.io compartida'),
      bullet('HTTP v\u00EDa Axios; no usar fetch directamente'),
      bullet('Tema MUI centralizado en theme/theme.ts'),
      spacer(),

      h2('8.5 Componentes Printable'),
      p('Los componentes Printable*.tsx se renderizan en un div oculto y se imprimen con window.print(). No usan llamadas al backend; generan PDF directamente en el navegador.'),
      spacer(),

      // ═══════════════════════════════════════════════════════════════════════
      // 9. M\u00D3DULO ROOT
      // ═══════════════════════════════════════════════════════════════════════
      h1('9. M\u00F3dulo ROOT'),
      p('Exclusivo del rol root (usuario ROOT, id=30). Accesible en /root y /api/root/*. En el sidebar solo ve la secci\u00F3n "Sistema".'),

      h2('9.1 Tabs del Panel ROOT'),
      table(
        ['Tab', 'Contenido'],
        [
          ['Resumen', 'M\u00E9tricas generales del sistema'],
          ['Base de Datos', 'Health check Supabase (SELECT 1 directo), tama\u00F1o de tablas'],
          ['Almacenamiento', 'Health check Cloudinary (status.cloudinary.com/api/v2/status.json)'],
          ['Servicios', 'Estado de servicios externos'],
          ['Auditor\u00EDa', 'Visor del log auditoria_log con filtros'],
          ['Backup', 'Generaci\u00F3n y descarga de backups'],
          ['Mantenimiento', 'Operaciones de mantenimiento de BD'],
          ['Alertas', 'Configuraci\u00F3n de umbrales (alertas_umbral)'],
          ['Cat\u00E1logo', 'CRUD del cat\u00E1logo de productos (movido desde Configuraci\u00F3n)'],
        ],
        [2400, 6960]
      ),
      spacer(),

      h2('9.2 Health Checks'),
      bullet('Supabase: SELECT 1 directo a la BD (no HTTP). M\u00E1s confiable que pings a endpoints protegidos.'),
      bullet('Cloudinary: GET a status.cloudinary.com/api/v2/status.json.'),
      spacer(),

      // ═══════════════════════════════════════════════════════════════════════
      // 10. APP M\u00D3VIL
      // ═══════════════════════════════════════════════════════════════════════
      h1('10. Aplicaci\u00F3n M\u00F3vil'),
      p('Directorio mobile-app/. Usa Expo Router (file-based routing en app/), no React Navigation. Orientada a instaladores en campo.'),
      bullet('Expo Go para desarrollo, APK para distribuci\u00F3n'),
      bullet('Expo Router: rutas basadas en archivos dentro de app/'),
      bullet('Consume la misma API REST del backend v\u00EDa REACT_APP_API_URL'),
      spacer(),

      // ═══════════════════════════════════════════════════════════════════════
      // 11. DESARROLLO LOCAL
      // ═══════════════════════════════════════════════════════════════════════
      h1('11. Gu\u00EDa de Desarrollo Local'),

      h2('11.1 Levantar el Backend'),
      ...codeBlock([
        'cd backend-api',
        'npm install',
        'npm run dev        # hot-reload en puerto 3001',
      ]),
      spacer(),

      h2('11.2 Levantar el Frontend'),
      ...codeBlock([
        'cd frontend-web',
        'npm install',
        'npm start          # dev server en http://localhost:3000',
      ]),
      spacer(),

      h2('11.3 Levantar la App M\u00F3vil'),
      ...codeBlock([
        'cd mobile-app',
        'expo start',
        'expo start --android   # emulador Android',
      ]),
      spacer(),

      h2('11.4 Otros Comandos \u00DAtiles'),
      table(
        ['Comando', 'Descripci\u00F3n'],
        [
          ['npm run build (backend)', 'Compila TypeScript a dist/'],
          ['npm run start (backend)', 'Producci\u00F3n (node dist/server.js)'],
          ['npm run lint / lint:fix', 'ESLint en el backend'],
          ['npm run format', 'Prettier en el backend'],
          ['npm run build (frontend)', 'Build producci\u00F3n (CI=false)'],
          ['node replace_urls.js', 'Reemplaza URLs hardcodeadas al cambiar entorno'],
        ],
        [3600, 5760]
      ),
      spacer(),

      h2('11.5 Scripts One-Off (No ejecutar en producci\u00F3n)'),
      p('Los siguientes archivos en backend-api/src/ son migraciones puntuales ya ejecutadas. No forman parte del flujo normal:'),
      bullet('seed.ts, seed_odps.ts'),
      bullet('migrate_nc.ts, db_master_fix.ts'),
      bullet('fix_name.ts, insertar_asesores.ts'),
      bullet('importar_clientes_excel.ts'),
      spacer(),

      // ═══════════════════════════════════════════════════════════════════════
      // 12. DESPLIEGUE
      // ═══════════════════════════════════════════════════════════════════════
      h1('12. Despliegue a Producci\u00F3n'),

      h2('12.1 Backend (Docker)'),
      p('El backend usa un Dockerfile multi-stage basado en node:20-alpine:'),
      ...codeBlock([
        '# Build',
        'docker build -t templex-backend .',
        '# Run',
        'docker run -p 3001:3001 --env-file .env templex-backend',
      ]),
      spacer(),

      h2('12.2 Frontend (Netlify / Vercel)'),
      bullet('Push a main dispara el build autom\u00E1tico.'),
      bullet('Variable CI=false para no fallar por warnings de React.'),
      bullet('El backend debe tener FRONTEND_URL apuntando al dominio de producci\u00F3n.'),

      h2('12.3 CORS'),
      bullet('HTTP: whitelist + patrones *.netlify.app, *.vercel.app'),
      bullet('WebSocket: solo localhost:3000, FRONTEND_URL, *.netlify.app, *.vercel.app'),

      h2('12.4 Nginx (Reverse Proxy)'),
      ...codeBlock([
        'location /api/ {',
        '    proxy_pass http://backend:3001;',
        '}',
        'location / {',
        '    try_files $uri /index.html;  # SPA routing',
        '}',
      ]),
      spacer(),

      // ═══════════════════════════════════════════════════════════════════════
      // 13. NOTAS T\u00C9CNICAS ADICIONALES
      // ═══════════════════════════════════════════════════════════════════════
      h1('13. Notas T\u00E9cnicas Adicionales'),

      h2('13.1 Importaci\u00F3n de Modelos'),
      p('SIEMPRE importar modelos desde models/index.ts para que las asociaciones est\u00E9n cargadas. Dos modelos se importan directamente en sus controladores por convenci\u00F3n:'),
      bullet('Produccion \u2192 produccion.controller.ts'),
      bullet('ProgramacionInstalacion \u2192 instalacion.controller.ts'),

      h2('13.2 ODP sin Timestamps'),
      p('ODP.timestamps = false. La tabla odp no tiene createdAt/updatedAt. Usa el campo fecha_creacion gestionado manualmente.'),

      h2('13.3 Revertir Cambios (Auditor\u00EDa)'),
      p('El hook beforeUpdate guarda instance.previous() en instance._auditAntes. Si datos_anteriores es null en un UPDATE, el revert no puede ejecutarse porque no se captur\u00F3 el estado previo.'),

      h2('13.4 Cron del PedidoPV'),
      p('Existe un cron diario a las 8am que revisa PedidoPVs con tardanza y genera alertas.'),

      h2('13.5 No Hay Tests Automatizados'),
      p('No existen tests unitarios ni de integraci\u00F3n en backend ni frontend. Toda validaci\u00F3n es manual.'),

      h2('13.6 M\u00F3dulo de Cotizaciones'),
      p('IMPORTANTE: "cotizaciones" en el contexto del equipo normalmente se refiere al COTModal dentro del m\u00F3dulo ODP, NO al m\u00F3dulo /cotizaciones que est\u00E1 en construcci\u00F3n y solo visible para admin.'),

      spacer(),

      // Fin
      new Paragraph({
        children: [new TextRun({ text: '\u2014 Fin del documento \u2014', size: 20, font: 'Arial', color: 'AAAAAA', italics: true })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 720 },
      }),
    ],
  }],
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync('documentation/Manual_Tecnico_Vidrios_Templex_ERP.docx', buffer);
  console.log('Manual generado correctamente.');
}).catch(err => {
  console.error('Error al generar el manual:', err);
  process.exit(1);
});
