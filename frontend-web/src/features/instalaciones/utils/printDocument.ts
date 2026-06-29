import { toast } from 'react-toastify';

type TipoDoc = 'op' | 'tecnico' | 'sap';

export const abrirDocumento = (odp: any, tipo: TipoDoc) => {
  const win = window.open('', '_blank', 'width=950,height=800');
  if (!win) return;
  const contenidoId = tipo === 'op' ? `print-op-${odp.id}` :
    tipo === 'tecnico' ? `print-tec-${odp.id}` :
    `print-sap-${odp.id}`;
  const el = document.getElementById(contenidoId);
  if (!el) return toast.error('Documento no disponible');
  win.document.write(`<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body>${el.innerHTML}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
};
