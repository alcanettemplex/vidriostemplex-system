import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database';

class SupervisionLineamientoItem extends Model {}

SupervisionLineamientoItem.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    lineamiento_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'supervision_lineamientos', key: 'id' },
      onDelete: 'CASCADE',
    },
    lead_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
    },
    // Ítems de ODP del reporte diario (2026-10-12). Un ítem es de lead o de ODP, nunca ambos.
    odp_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'odp', key: 'id' },
    },
    texto_accion: { type: DataTypes.TEXT, allowNull: false },
    prioridad: {
      type: DataTypes.ENUM('alta', 'media', 'baja'),
      allowNull: false,
    },
    // SIN_ASIGNAR, FACTURAR, FACTURAR_INSTALADA y COBRAR: reporte diario (2026-10-12).
    origen: {
      type: DataTypes.ENUM(
        'PRIMER_CONTACTO', 'ALTO_VALOR', 'SEGUIMIENTO', 'MANUAL',
        'SIN_ASIGNAR', 'FACTURAR', 'FACTURAR_INSTALADA', 'COBRAR',
      ),
      allowNull: false,
    },
    cumplido: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    fecha_cumplido: { type: DataTypes.DATE, allowNull: true },
    // Parte del reporte diario en que salió (1, 2…). NULL = ítem del generador de
    // lineamiento por asesor, que no forma parte de un envío.
    envio: { type: DataTypes.SMALLINT, allowNull: true },
    // Copia de lo que se dijo en el envío (monto, días, estado): el historial muestra
    // el dato de ese día, no el de hoy.
    detalle: { type: DataTypes.JSONB, allowNull: true },
    // true = lo marcó el sistema al detectar que se resolvió.
    cumplido_automatico: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // true = un usuario lo marcó/desmarcó a mano: el sistema ya no lo vuelve a tocar.
    marcado_manual: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    modelName: 'SupervisionLineamientoItem',
    tableName: 'supervision_lineamiento_items',
    timestamps: true,
    updatedAt: false,
  },
);

export default SupervisionLineamientoItem;
