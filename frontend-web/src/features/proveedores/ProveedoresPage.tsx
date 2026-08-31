import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Building2, Search, UploadCloud, Clock, GitCompare } from 'lucide-react';
import FolderTabs, { FolderTabItem } from '../../components/FolderTabs';
import ConsultarPreciosTab from './components/tabs/ConsultarPreciosTab';
import ProveedoresTab from './components/tabs/ProveedoresTab';
import CargarFacturasTab from './components/tabs/CargarFacturasTab';
import PorMapearTab from './components/tabs/PorMapearTab';
import EquivalenciasTab from './components/tabs/EquivalenciasTab';
import API from '../../services/config';

const FOLDER_BODY =
  'bg-white dark:bg-[var(--surface)] border border-t-0 border-[var(--border)] rounded-b-2xl rounded-tr-2xl p-6 min-h-[450px]';

/** Proveedor en su forma reducida: es lo único que necesitan los selectores */
export interface ProveedorCompacto {
  id: number;
  nombre_comercial: string;
  seguir_precios?: boolean;
}

const ProveedoresPage: React.FC = () => {
  const [tab, setTab] = useState('consultar');
  const [pendientesCount, setPendientesCount] = useState<number>(0);
  const [proveedores, setProveedores] = useState<ProveedorCompacto[]>([]);

  /** Solo el número: antes se descargaba la bandeja completa para hacer un .length */
  const fetchPendientesCount = useCallback(async () => {
    try {
      const { data } = await axios.get<{ count: number }>(`${API}/api/proveedores/codigos-pendientes/count`);
      setPendientesCount(data?.count ?? 0);
    } catch {
      setPendientesCount(0);
    }
  }, []);

  /**
   * El maestro compacto se carga una sola vez y se comparte con las pestañas.
   * Antes "Por Mapear" y "Equivalencias" pedían cada una los 1.011 proveedores
   * completos al montarse, y cambiar de pestaña lo repetía.
   */
  const fetchProveedores = useCallback(async () => {
    try {
      const { data } = await axios.get<ProveedorCompacto[]>(`${API}/api/proveedores`, {
        params: { compacto: true },
      });
      if (Array.isArray(data)) setProveedores(data);
    } catch {
      setProveedores([]);
    }
  }, []);

  useEffect(() => {
    fetchPendientesCount();
    fetchProveedores();
  }, [fetchPendientesCount, fetchProveedores]);

  const tabs: FolderTabItem[] = [
    {
      key: 'consultar',
      label: 'Consultar Precios',
      icon: <Search size={14} />,
    },
    {
      key: 'cargar',
      label: 'Cargar Facturas',
      icon: <UploadCloud size={14} />,
    },
    {
      key: 'mapear',
      label: 'Por Mapear',
      icon: <Clock size={14} />,
      badge: pendientesCount > 0 ? pendientesCount : undefined,
      badgeClassName: 'bg-amber-100 text-amber-800 font-bold',
    },
    {
      key: 'maestro',
      label: 'Proveedores',
      icon: <Building2 size={14} />,
    },
    {
      key: 'equivalencias',
      label: 'Equivalencias',
      icon: <GitCompare size={14} />,
    },
  ];

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1280, margin: '0 auto' }}>

      {/* ── Encabezado ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>
          Módulo de Proveedores
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 6 }}>
          Consulta comparativa de precios · Ingesta de facturas electrónicas (.zip / XML) · Maestro de equivalencias
        </p>
      </div>

      {/* ── Tabs ── */}
      <div className="relative">
        <FolderTabs tabs={tabs} activeKey={tab} onChange={setTab} />
        <div className={FOLDER_BODY}>
          {tab === 'consultar' && <ConsultarPreciosTab />}
          {tab === 'cargar' && (
            <CargarFacturasTab
              onIrAPorMapear={() => setTab('mapear')}
              onLoteProcesado={() => {
                fetchPendientesCount();
                fetchProveedores();
              }}
            />
          )}
          {tab === 'mapear' && (
            <PorMapearTab
              proveedores={proveedores}
              onActualizarContador={fetchPendientesCount}
              onProveedoresCambiados={fetchProveedores}
            />
          )}
          {tab === 'maestro' && <ProveedoresTab onCambio={fetchProveedores} />}
          {tab === 'equivalencias' && (
            <EquivalenciasTab
              proveedores={proveedores}
              onActualizarContador={fetchPendientesCount}
            />
          )}
        </div>
      </div>

    </div>
  );
};

export default ProveedoresPage;
