import * as fs from 'fs';
import * as path from 'path';

const MEMORIA_PATH = path.join(__dirname, '../../memoria_agente.json');

export interface LeadMemoria {
  leadId: number;
  asesorId: number;
  primeraAlertaEn: string; // ISO timestamp de cuándo se envió el primer aviso
  ciclosAlertados: number; // cuántas veces consecutivas se ha alertado sobre este lead
}

export interface MemoriaAgente {
  ultimaEjecucion: string;
  leads: { [leadId: number]: LeadMemoria };
}

export function leerMemoria(): MemoriaAgente {
  try {
    if (!fs.existsSync(MEMORIA_PATH)) {
      return { ultimaEjecucion: '', leads: {} };
    }
    const raw = fs.readFileSync(MEMORIA_PATH, 'utf-8');
    return JSON.parse(raw) as MemoriaAgente;
  } catch {
    return { ultimaEjecucion: '', leads: {} };
  }
}

export function guardarMemoria(memoria: MemoriaAgente): void {
  fs.writeFileSync(MEMORIA_PATH, JSON.stringify(memoria, null, 2), 'utf-8');
}
