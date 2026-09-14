// Reglas de negocio del módulo Proveedores que necesitan compartirse fuera de
// proveedor.controller.ts (ese archivo importa tipos de Express que arrastran
// la augmentación global de `Request.user`, y los scripts one-off que se
// ejecutan con `npx ts-node <script>` — sin pasar por el build completo del
// proyecto — no la resuelven si no la importan por su cuenta; separar estas
// reglas puras evita ese acoplamiento en vez de parchear cada script).

/**
 * Regla única de "¿este proveedor alimenta la bandeja de mapeo / los cálculos
 * de costo derivados de su precio?". Son dos columnas porque significan cosas
 * distintas —`activo` es la baja lógica del maestro y `seguir_precios` la
 * decisión sobre sus precios— pero se leen juntas: dar de baja a un proveedor
 * y que sus precios siguieran alimentando algo era una inconsistencia que
 * solo se explicaba leyendo el código.
 *
 * `seguir_precios` en NULL significa "sin decidir": no se sigue todavía, pero
 * tampoco es un rechazo.
 */
export function siguePrecios(proveedor: any): boolean {
  return proveedor.getDataValue('activo') === true && proveedor.getDataValue('seguir_precios') === true;
}
