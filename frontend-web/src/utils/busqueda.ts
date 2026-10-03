import { useEffect, useState } from 'react';

/**
 * Normaliza texto para comparar en una búsqueda: sin tildes, minúsculas y sin espacios
 * en los extremos. "  Martínez " y "martinez" quedan iguales.
 * Es la misma normalización que aplica el backend (normalizarTermino + translate() en
 * contabilidad.controller.ts), para que el filtro local y el del servidor coincidan.
 */
export const normalizarTexto = (s?: string | null): string =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Solo los dígitos: "900.123.456-7" → "9001234567". */
export const soloDigitos = (s?: string | null): string => (s || '').replace(/\D/g, '');

/**
 * ¿El término aparece en alguno de los campos? `numericos` se compara además por dígitos
 * (NIT/cédula escritos con o sin puntos y guiones), a partir de 3 dígitos para no
 * disparar coincidencias por un solo número.
 */
export const coincideBusqueda = (
  termino: string,
  campos: (string | null | undefined)[],
  numericos: (string | null | undefined)[] = [],
): boolean => {
  const t = normalizarTexto(termino);
  if (!t) return true;
  if (campos.some(c => normalizarTexto(c).includes(t))) return true;
  const d = soloDigitos(termino);
  return d.length >= 3 && numericos.some(n => soloDigitos(n).includes(d));
};

/**
 * Devuelve `valor` cuando lleva `ms` sin cambiar. Sirve para buscar en el servidor
 * cuando el usuario deja de escribir, en vez de una consulta por tecla.
 */
export function useValorDiferido<T>(valor: T, ms = 300): T {
  const [diferido, setDiferido] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setDiferido(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return diferido;
}
