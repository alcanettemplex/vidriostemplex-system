import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../../store/store';

/**
 * Módulos favoritos del usuario (rutas), para la barra de navegación y el buscador.
 *
 * Preferencia personal de este navegador: vive en localStorage bajo una clave por usuario, no
 * en la BD (sin egress, sin tabla nueva). Si el almacenamiento no está disponible (ventana
 * privada, bloqueo del navegador) la función sigue andando en memoria durante la sesión.
 * Un favorito que el rol ya no puede ver se descarta al mostrar, no al guardar.
 */
const clave = (userId: number | string | undefined) => `templex.favoritos.${userId ?? 'anon'}`;

const leer = (k: string): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(k) || '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

export const useFavoritos = () => {
  const userId = useSelector((s: RootState) => (s as any).auth.user?.id) as number | undefined;
  const k = clave(userId);
  const [favoritos, setFavoritos] = useState<string[]>(() => leer(k));

  useEffect(() => { setFavoritos(leer(k)); }, [k]);

  const alternar = useCallback((path: string) => {
    setFavoritos(prev => {
      const next = prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path];
      try { localStorage.setItem(k, JSON.stringify(next)); } catch { /* sin almacenamiento: queda en memoria */ }
      return next;
    });
  }, [k]);

  const esFavorito = useCallback((path: string) => favoritos.includes(path), [favoritos]);

  return { favoritos, alternar, esFavorito };
};

export type Favoritos = ReturnType<typeof useFavoritos>;
