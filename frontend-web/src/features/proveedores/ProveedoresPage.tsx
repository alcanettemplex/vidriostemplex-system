import React, { useState } from 'react';
import { Building2, Search } from 'lucide-react';
import FolderTabs, { FolderTabItem } from '../../components/FolderTabs';
import ConsultarPreciosTab from './components/tabs/ConsultarPreciosTab';
import ProveedoresTab from './components/tabs/ProveedoresTab';

// ─── Pestañas de Fase 1 ───────────────────────────────────────────────────────
// Fase 2 agregará: Cargar Facturas, Por Mapear, Equivalencias

const TABS: FolderTabItem[] = [
  {
    key: 'consultar',
    label: 'Consultar Precios',
    icon: <Search size={14} />,
  },
  {
    key: 'maestro',
    label: 'Proveedores',
    icon: <Building2 size={14} />,
  },
];

const FOLDER_BODY =
  'bg-white dark:bg-[var(--surface)] border border-t-0 border-[var(--border)] rounded-b-2xl rounded-tr-2xl p-6 min-h-[400px]';

const ProveedoresPage: React.FC = () => {
  const [tab, setTab] = useState('consultar');

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1280, margin: '0 auto' }}>

      {/* ── Encabezado ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>
          Módulo de Proveedores
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 6 }}>
          Consulta comparativa de precios · Maestro de proveedores y equivalencias de productos
        </p>
      </div>

      {/* ── Tabs ── */}
      <div className="relative">
        <FolderTabs tabs={TABS} activeKey={tab} onChange={setTab} />
        <div className={FOLDER_BODY}>
          {tab === 'consultar' && <ConsultarPreciosTab />}
          {tab === 'maestro' && <ProveedoresTab />}
        </div>
      </div>

    </div>
  );
};

export default ProveedoresPage;
