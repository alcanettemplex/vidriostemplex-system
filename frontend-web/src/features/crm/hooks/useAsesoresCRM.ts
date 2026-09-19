import { useCallback, useEffect, useState } from 'react';
import { apiGetAsesores } from '../crmService';

const ROLES_ASESORES_CRM = ['asesor_comercial', 'admin', 'gerencia', 'jefe_produccion'];

interface AsesorCRM {
  id: number;
  nombre_completo: string;
  rol: string;
}

/** Lista de usuarios que gestionan leads (para poblar selectores de asesor en CRM/Supervisión). */
export function useAsesoresCRM(habilitado: boolean = true) {
  const [asesores, setAsesores] = useState<AsesorCRM[]>([]);

  const cargar = useCallback(async () => {
    if (!habilitado) return;
    try {
      const { data } = await apiGetAsesores();
      setAsesores((data || []).filter((u: any) => ROLES_ASESORES_CRM.includes(u.rol)));
    } catch { /* silencioso */ }
  }, [habilitado]);

  useEffect(() => { cargar(); }, [cargar]);

  return asesores;
}
