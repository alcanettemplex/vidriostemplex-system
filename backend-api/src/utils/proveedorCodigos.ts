import { Op, Transaction } from 'sequelize';
import { ProveedorProducto, ProveedorProductoCodigo } from '../models';

/**
 * Resolución de códigos de proveedor → equivalencias.
 *
 * Un proveedor puede facturar el mismo producto con varios códigos distintos
 * (ver la cabecera de `proveedor_producto_codigo.model.ts`). Todo lo que traduce
 * "código que viene en el documento" → "qué fila de precio toco" pasa por aquí.
 *
 * Vive en `utils/` y no en `proveedor.controller.ts` por la misma razón que
 * `pedidoPvCapacidad.ts`: el controlador importa tipos de Express que arrastran
 * la augmentación global de `Request.user`, y los scripts one-off que se corren
 * con `npx ts-node` no la resuelven. Además el lookup estaba duplicado en tres
 * sitios (ingesta de FE, importación de listas y el modal de vinculación) con
 * reglas que ya habían empezado a divergir.
 */

/** Normaliza un código para comparar: el proveedor no siempre respeta espacios ni caja. */
export function normalizarCodigo(codigo: string | null | undefined): string {
  return String(codigo ?? '').trim().toUpperCase();
}

/**
 * Devuelve, para cada código consultado, las equivalencias activas de ese proveedor
 * que lo declaran — sea como código principal o como código adicional.
 *
 * La clave del Map es el código tal y como se pidió, para que quien llama no tenga
 * que volver a normalizar. Varias claves pueden apuntar a la MISMA equivalencia:
 * eso es exactamente el caso que esta tabla vino a resolver, y quien procesa un
 * documento completo debe contemplarlo (ver el aviso CODIGOS_ALIAS_MISMA_FACTURA).
 */
export async function resolverEquivalenciasPorCodigo(
  proveedorId: number,
  codigos: string[],
  transaction?: Transaction
): Promise<Map<string, any[]>> {
  const resultado = new Map<string, any[]>();
  const normalizados = Array.from(new Set(codigos.map(normalizarCodigo))).filter(Boolean);
  if (normalizados.length === 0) return resultado;

  const filas = await ProveedorProductoCodigo.findAll({
    where: { proveedor_id: proveedorId, codigo_proveedor: { [Op.in]: normalizados } },
    include: [
      {
        model: ProveedorProducto,
        as: 'equivalencia',
        where: { activo: true },
        required: true,
      },
    ],
    transaction,
  });

  // Índice por código normalizado; después se reexpone con la clave original
  const porNormalizado = new Map<string, any[]>();
  for (const fila of filas) {
    const cod = normalizarCodigo(fila.getDataValue('codigo_proveedor'));
    const equivalencia = (fila as any).getDataValue('equivalencia');
    if (!equivalencia) continue;
    if (!porNormalizado.has(cod)) porNormalizado.set(cod, []);
    // Un mismo código puede estar en dos equivalencias del mismo producto con
    // modalidades distintas (proveedor 1029: 3, 11 y 32 en UNIDAD y M2).
    const yaEsta = porNormalizado
      .get(cod)!
      .some((eq: any) => Number(eq.getDataValue('id')) === Number(equivalencia.getDataValue('id')));
    if (!yaEsta) porNormalizado.get(cod)!.push(equivalencia);
  }

  for (const codigo of codigos) {
    const encontradas = porNormalizado.get(normalizarCodigo(codigo));
    if (encontradas && encontradas.length > 0) resultado.set(codigo, encontradas);
  }

  return resultado;
}

/**
 * Busca si un código ya está tomado por OTRO producto del mismo proveedor.
 *
 * Que un código apunte a dos modalidades del mismo producto es legítimo; que
 * apunte a dos productos distintos no lo es: la ingesta dejaría de ser
 * determinista y el precio caería en la fila equivocada.
 */
export async function codigoEnOtroProducto(
  proveedorId: number,
  codigo: string,
  catalogoProductoId: number,
  transaction?: Transaction
): Promise<any | null> {
  const filas = await ProveedorProductoCodigo.findAll({
    where: { proveedor_id: proveedorId, codigo_proveedor: normalizarCodigo(codigo) },
    include: [{ model: ProveedorProducto, as: 'equivalencia', where: { activo: true }, required: true }],
    transaction,
  });

  for (const fila of filas) {
    const eq = (fila as any).getDataValue('equivalencia');
    if (eq && Number(eq.getDataValue('catalogo_producto_id')) !== Number(catalogoProductoId)) {
      return eq;
    }
  }
  return null;
}

/**
 * Registra un código para una equivalencia. Idempotente: si ya lo tenía, solo
 * completa la descripción que faltara.
 *
 * Mantiene sincronizado `proveedor_producto.codigo_proveedor` con el principal:
 * la primera alta de una equivalencia sin códigos se marca principal sola, para
 * que ninguna quede con códigos pero sin principal.
 */
export async function registrarCodigo(
  pp: any,
  codigo: string,
  opciones: {
    descripcion?: string | null;
    origen?: string;
    principal?: boolean;
    transaction?: Transaction;
  } = {}
): Promise<{ fila: any; creado: boolean }> {
  const { descripcion = null, origen = 'MANUAL', principal = false, transaction } = opciones;
  const normalizado = normalizarCodigo(codigo);
  if (!normalizado) throw new Error('El código del proveedor no puede estar vacío.');

  const ppId = Number(pp.getDataValue('id'));
  const proveedorId = Number(pp.getDataValue('proveedor_id'));

  const existentes = await ProveedorProductoCodigo.findAll({
    where: { proveedor_producto_id: ppId },
    transaction,
  });

  const yaRegistrado = existentes.find(
    (f) => normalizarCodigo(f.getDataValue('codigo_proveedor')) === normalizado
  );

  // Sin códigos todavía: el primero manda, venga de donde venga
  const debeSerPrincipal = principal || existentes.length === 0;

  let fila = yaRegistrado;
  let creado = false;

  if (fila) {
    const cambios: any = {};
    if (descripcion && !fila.getDataValue('descripcion_proveedor')) {
      cambios.descripcion_proveedor = descripcion;
    }
    if (debeSerPrincipal && fila.getDataValue('principal') !== true) cambios.principal = true;
    if (Object.keys(cambios).length) await fila.update(cambios, { transaction });
  } else {
    fila = await ProveedorProductoCodigo.create(
      {
        proveedor_producto_id: ppId,
        proveedor_id: proveedorId,
        codigo_proveedor: normalizado,
        descripcion_proveedor: descripcion || null,
        principal: debeSerPrincipal,
        origen,
      },
      { transaction }
    );
    creado = true;
  }

  if (debeSerPrincipal) {
    await ProveedorProductoCodigo.update(
      { principal: false },
      {
        where: { proveedor_producto_id: ppId, id: { [Op.ne]: Number(fila!.getDataValue('id')) } },
        transaction,
      }
    );
    if (normalizarCodigo(pp.getDataValue('codigo_proveedor')) !== normalizado) {
      await pp.update({ codigo_proveedor: normalizado }, { transaction });
    }
  }

  return { fila: fila!, creado };
}

/**
 * Quita un código. Si era el principal, promueve el más antiguo que quede; si era
 * el último, la equivalencia se queda sin código (estado válido: hoy hay 29 así,
 * creadas por el script de precios por tira del 2026-09-17).
 */
export async function quitarCodigo(
  pp: any,
  codigoId: number,
  transaction?: Transaction
): Promise<{ eliminado: string; nuevoPrincipal: string | null }> {
  const ppId = Number(pp.getDataValue('id'));
  const fila = await ProveedorProductoCodigo.findOne({
    where: { id: codigoId, proveedor_producto_id: ppId },
    transaction,
  });
  if (!fila) throw new Error('Ese código no pertenece a esta equivalencia.');

  const eraPrincipal = fila.getDataValue('principal') === true;
  const eliminado = String(fila.getDataValue('codigo_proveedor'));
  await fila.destroy({ transaction });

  let nuevoPrincipal: string | null = null;
  if (eraPrincipal) {
    const restantes = await ProveedorProductoCodigo.findAll({
      where: { proveedor_producto_id: ppId },
      order: [['id', 'ASC']],
      limit: 1,
      transaction,
    });
    if (restantes.length > 0) {
      await restantes[0].update({ principal: true }, { transaction });
      nuevoPrincipal = String(restantes[0].getDataValue('codigo_proveedor'));
    }
    await pp.update({ codigo_proveedor: nuevoPrincipal }, { transaction });
  }

  return { eliminado, nuevoPrincipal };
}

/** Todos los códigos de una equivalencia, el principal primero. */
export async function listarCodigos(ppId: number, transaction?: Transaction) {
  return ProveedorProductoCodigo.findAll({
    where: { proveedor_producto_id: ppId },
    attributes: ['id', 'codigo_proveedor', 'descripcion_proveedor', 'principal', 'origen', 'fecha_alta'],
    order: [['principal', 'DESC'], ['id', 'ASC']],
    transaction,
  });
}
