import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Building2, Search, UploadCloud, Clock, GitCompare } from 'lucide-react';
import FolderTabs, { FolderTabItem } from '../../components/FolderTabs';
import ConsultarPreciosTab from './components/tabs/ConsultarPreciosTab';
import ProveedoresTab from './components/tabs/ProveedoresTab';
import CargarFacturasTab from './components/tabs/CargarFacturasTab';
import PorMapearTab from './components/tabs/PorMapearTab';
import EquivalenciasTab from './components/tabs/EquivalenciasTab';
import BuscadorProveedores, { SeleccionBusqueda } from './components/BuscadorProveedores';
import API from '../../services/config';

const FOLDER_BODY =
  'bg-white dark:bg-[var(--surface)] border border-t-0 border-[var(--border)] rounded-b-2xl rounded-tr-2xl p-6 min-h-[450px]';

/** Proveedor en su forma reducida: es lo único que necesitan los selectores */
export interface ProveedorCompacto {
  id: number;
  nombre_comercial: string;
  /** null = sin decidir: la ingesta lo descubrió y nadie ha resuelto si interesa */
  seguir_precios?: boolean | null;
}

/**
 * Contexto que la barra de búsqueda entrega a una pestaña al elegir un resultado.
 * El `nonce` fuerza el remontaje: sin él, elegir dos veces el mismo proveedor no
 * volvería a aplicar el filtro, porque el valor no habría cambiado.
 */
interface ContextoTab {
  tab: string;
  producto?: number;
  busqueda?: string;
  nonce: number;
}

const ProveedoresPage: React.FC = () => {
  const [tab, setTab] = useState('consultar');
  const [pendientesCount, setPendientesCount] = useState<number>(0);
  const [proveedores, setProveedores] = useState<ProveedorCompacto[]>([]);
  const [contexto, setContexto] = useState<ContextoTab | null>(null);

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

  /** Cada tipo de resultado sabe a qué pestaña pertenece y con qué filtro entrar */
  const irAResultado = useCallback((seleccion: SeleccionBusqueda) => {
    const nonce = Date.now();
    switch (seleccion.tipo) {
      case 'producto':
        setContexto({ tab: 'consultar', producto: seleccion.id, nonce });
        setTab('consultar');
        break;
      case 'proveedor':
        setContexto({ tab: 'maestro', busqueda: seleccion.etiqueta, nonce });
        setTab('maestro');
        break;
      case 'pendiente':
        setContexto({ tab: 'mapear', busqueda: seleccion.codigo, nonce });
        setTab('mapear');
        break;
      case 'equivalencia':
        setContexto({ tab: 'equivalencias', busqueda: seleccion.codigo, nonce });
        setTab('equivalencias');
        break;
      case 'factura':
        setContexto({ tab: 'cargar', busqueda: seleccion.termino, nonce });
        setTab('cargar');
        break;
    }
  }, []);

  /** El contexto solo aplica a la pestaña para la que se generó */
  const contextoDe = (clave: string) => (contexto?.tab === clave ? contexto : null);
  const claveRemontaje = (clave: string) => `${clave}-${contextoDe(clave)?.nonce ?? 0}`;

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

      {/* ── Buscador transversal ── */}
      <BuscadorProveedores onSeleccion={irAResultado} />

      {/* ── Tabs ── */}
      <div className="relative">
        <FolderTabs tabs={tabs} activeKey={tab} onChange={setTab} />
        <div className={FOLDER_BODY}>
          {tab === 'consultar' && (
            <ConsultarPreciosTab
              key={claveRemontaje('consultar')}
              productoInicial={contextoDe('consultar')?.producto}
            />
          )}
          {tab === 'cargar' && (
            <CargarFacturasTab
              key={claveRemontaje('cargar')}
              proveedores={proveedores}
              busquedaFacturasInicial={contextoDe('cargar')?.busqueda}
              onIrAPorMapear={() => setTab('mapear')}
              onLoteProcesado={() => {
                fetchPendientesCount();
                fetchProveedores();
              }}
            />
          )}
          {tab === 'mapear' && (
            <PorMapearTab
              key={claveRemontaje('mapear')}
              proveedores={proveedores}
              busquedaInicial={contextoDe('mapear')?.busqueda}
              onActualizarContador={fetchPendientesCount}
              onProveedoresCambiados={fetchProveedores}
            />
          )}
          {tab === 'maestro' && (
            <ProveedoresTab
              key={claveRemontaje('maestro')}
              busquedaInicial={contextoDe('maestro')?.busqueda}
              onCambio={fetchProveedores}
            />
          )}
          {tab === 'equivalencias' && (
            <EquivalenciasTab
              key={claveRemontaje('equivalencias')}
              proveedores={proveedores}
              busquedaInicial={contextoDe('equivalencias')?.busqueda}
              onActualizarContador={fetchPendientesCount}
            />
          )}
        </div>
      </div>

    </div>
  );
};

export default ProveedoresPage;
