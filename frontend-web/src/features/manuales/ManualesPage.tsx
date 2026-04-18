import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { BookOpen, Lock, Download, Eye, HardDrive, Users } from 'lucide-react';
import ManualVisor from './components/ManualVisor';
import { TOC_USUARIO, TOC_TECNICO } from './data/toc';

const ROLES_TECNICO = ['root', 'admin', 'gerencia', 'jefe_produccion'];

const ManualesPage: React.FC = () => {
  const user = useSelector((state: any) => state.auth.user);
  const userRol: string = (user?.rol || user?.role || '').toLowerCase();

  const [visor, setVisor] = useState<{ open: boolean; tipo: 'usuario' | 'tecnico'; titulo: string } | null>(null);

  const canAccessTecnico = ROLES_TECNICO.includes(userRol);

  const cards = [
    {
      tipo: 'usuario' as const,
      titulo: 'Manual de Usuario',
      subtitulo: 'Guía completa para todos los roles del sistema',
      description:
        'Aprende a usar cada módulo del ERP: clientes, ODPs, producción, instalaciones, compras, contabilidad y más. Incluye flujos paso a paso y glosario de términos.',
      pages: 47,
      icon: Users,
      gradient: 'from-indigo-500 to-violet-600',
      bgLight: 'bg-indigo-50',
      textAccent: 'text-indigo-600',
      borderAccent: 'border-indigo-200',
      locked: false,
    },
    {
      tipo: 'tecnico' as const,
      titulo: 'Manual Técnico',
      subtitulo: 'Documentación interna del sistema',
      description:
        'Arquitectura, modelos de base de datos, endpoints API, flujos de negocio, autenticación RBAC, WebSockets, despliegue y notas técnicas críticas.',
      pages: 20,
      icon: HardDrive,
      gradient: 'from-slate-600 to-slate-800',
      bgLight: 'bg-slate-50',
      textAccent: 'text-slate-700',
      borderAccent: 'border-slate-200',
      locked: !canAccessTecnico,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Page header */}
      <div className="max-w-4xl mx-auto mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Manuales del Sistema</h1>
            <p className="text-sm text-slate-500">Documentación oficial de Vidrios Templex ERP</p>
          </div>
        </div>
      </div>

      {/* Cards grid */}
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.tipo}
              className={`relative bg-white rounded-2xl border ${card.borderAccent} shadow-sm overflow-hidden flex flex-col
                ${card.locked ? 'opacity-60' : 'hover:shadow-md transition-shadow'}`}
            >
              {/* Card top gradient band */}
              <div className={`h-2 w-full bg-gradient-to-r ${card.gradient}`} />

              {/* Content */}
              <div className="p-6 flex flex-col flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl ${card.bgLight} flex items-center justify-center`}>
                    <Icon className={`w-6 h-6 ${card.textAccent}`} />
                  </div>
                  {card.locked && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-full">
                      <Lock className="w-3 h-3 text-slate-400" />
                      <span className="text-xs text-slate-500 font-medium">Acceso restringido</span>
                    </div>
                  )}
                </div>

                <h2 className="text-lg font-bold text-slate-800 mb-0.5">{card.titulo}</h2>
                <p className={`text-xs font-semibold mb-3 ${card.textAccent}`}>{card.subtitulo}</p>
                <p className="text-sm text-slate-500 flex-1 leading-relaxed">{card.description}</p>

                {/* Meta */}
                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    <span className="text-xs text-slate-400">{card.pages} páginas</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    <span className="text-xs text-slate-400">PDF</span>
                  </div>
                </div>

                {/* Actions */}
                {!card.locked && (
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => setVisor({ open: true, tipo: card.tipo, titulo: card.titulo })}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r ${card.gradient} hover:opacity-90 transition-opacity shadow-sm`}
                    >
                      <Eye className="w-4 h-4" />
                      Ver manual
                    </button>
                  </div>
                )}

                {card.locked && (
                  <div className="mt-4 flex items-center gap-2 px-3 py-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <Lock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <p className="text-xs text-slate-400">
                      Disponible para admin, gerencia y jefe de producción
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tip */}
      <div className="max-w-4xl mx-auto mt-8">
        <div className="flex items-start gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
          <BookOpen className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-indigo-700 leading-relaxed">
            <span className="font-semibold">Consejo:</span> Usa el buscador dentro del visor para encontrar rápidamente
            cualquier acción o módulo. Escribe lo que necesitas hacer, por ejemplo{' '}
            <em>"crear toma de medidas"</em> o <em>"registrar abono"</em>.
          </p>
        </div>
      </div>

      {/* Visor dialog */}
      {visor && (
        <ManualVisor
          open={visor.open}
          onClose={() => setVisor(null)}
          tipo={visor.tipo}
          titulo={visor.titulo}
          toc={visor.tipo === 'usuario' ? TOC_USUARIO : TOC_TECNICO}
        />
      )}
    </div>
  );
};

export default ManualesPage;
