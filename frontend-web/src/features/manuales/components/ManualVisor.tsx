import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  IconButton,
  TextField,
  InputAdornment,
  CircularProgress,
  Tooltip,
  Chip,
} from '@mui/material';
import {
  X,
  Search,
  Download,
  BookOpen,
  ChevronRight,
  FileText,
} from 'lucide-react';
import axios from 'axios';
import { TocEntry } from '../data/toc';
import API from '../../../services/config';

interface ManualVisorProps {
  open: boolean;
  onClose: () => void;
  tipo: 'usuario' | 'tecnico';
  titulo: string;
  toc: TocEntry[];
}

const normalize = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const ManualVisor: React.FC<ManualVisorProps> = ({ open, onClose, tipo, titulo, toc }) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [targetPage, setTargetPage] = useState(1);
  const [iframeKey, setIframeKey] = useState(0);
  const blobUrlRef = useRef<string | null>(null);
  const loadedRef = useRef(false);

  const loadPdf = useCallback(async () => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const token = sessionStorage.getItem('token');
      const response = await axios.get(`${API}/api/manuales/${tipo}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      blobUrlRef.current = url;
      setPdfUrl(url);
    } catch (err: any) {
      loadedRef.current = false;
      setError('No se pudo cargar el manual. Verifica tu conexión o permisos.');
    } finally {
      setLoading(false);
    }
  }, [tipo]);

  useEffect(() => {
    if (open) loadPdf();
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [open, loadPdf]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const token = sessionStorage.getItem('token');
      const response = await axios.get(`${API}/api/manuales/${tipo}`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        tipo === 'usuario'
          ? 'Manual_Usuario_Vidrios_Templex_ERP.pdf'
          : 'Manual_Tecnico_Vidrios_Templex_ERP.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silencioso
    } finally {
      setDownloading(false);
    }
  };

  const navigateToPage = (entry: TocEntry) => {
    setActiveId(entry.id);
    setTargetPage(entry.page);
    setIframeKey((k) => k + 1);
  };

  const filteredToc = search.trim()
    ? toc.filter((entry) => {
        const q = normalize(search);
        return (
          normalize(entry.title).includes(q) ||
          entry.keywords.some((kw) => normalize(kw).includes(q))
        );
      })
    : toc;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      PaperProps={{ sx: { bgcolor: '#0f172a', display: 'flex', flexDirection: 'column' } }}
    >
      {/* HEADER */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">{titulo}</p>
            <p className="text-slate-400 text-xs">
              {tipo === 'usuario'
                ? '47 páginas · Manual de Uso'
                : '20 páginas · Documentación Técnica'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip title="Descargar PDF">
            <IconButton
              onClick={handleDownload}
              disabled={downloading}
              size="small"
              sx={{
                color: 'rgb(148 163 184)',
                '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.08)' },
              }}
            >
              {downloading ? (
                <CircularProgress size={16} sx={{ color: 'inherit' }} />
              ) : (
                <Download className="w-4 h-4" />
              )}
            </IconButton>
          </Tooltip>
          <Tooltip title="Cerrar">
            <IconButton
              onClick={onClose}
              size="small"
              sx={{
                color: 'rgb(148 163 184)',
                '&:hover': { color: 'white', bgcolor: 'rgba(255,255,255,0.08)' },
              }}
            >
              <X className="w-4 h-4" />
            </IconButton>
          </Tooltip>
        </div>
      </div>

      {/* BODY */}
      <DialogContent sx={{ p: 0, display: 'flex', overflow: 'hidden', flex: 1 }}>
        {/* TOC PANEL */}
        <div className="w-72 flex-shrink-0 bg-slate-900 border-r border-slate-700 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-700">
            <TextField
              fullWidth
              size="small"
              placeholder="Buscar sección o acción..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoComplete="off"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                  </InputAdornment>
                ),
                sx: {
                  bgcolor: 'rgba(255,255,255,0.05)',
                  color: 'white',
                  fontSize: '0.8rem',
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                  '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                  '&.Mui-focused fieldset': { borderColor: '#6366f1' },
                  '& input::placeholder': { color: 'rgb(100 116 139)', opacity: 1 },
                },
              }}
            />
            {search && (
              <p className="text-slate-500 text-[10px] mt-1.5 px-1">
                {filteredToc.length} resultado{filteredToc.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          <nav className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
            {filteredToc.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-500">
                <FileText className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-xs text-center">
                  Sin resultados para
                  <br />
                  "{search}"
                </p>
              </div>
            ) : (
              filteredToc.map((entry) => {
                const isActive = activeId === entry.id;
                return (
                  <button
                    key={entry.id}
                    onClick={() => navigateToPage(entry)}
                    className={`
                      w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg transition-all group
                      ${
                        isActive
                          ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                      }
                      ${entry.level === 2 ? 'pl-6' : ''}
                    `}
                  >
                    <ChevronRight
                      className={`w-3 h-3 flex-shrink-0 transition-transform
                        ${isActive ? 'rotate-90 text-indigo-400' : 'text-slate-600 group-hover:text-slate-400'}`}
                    />
                    <span className="flex-1 text-xs leading-snug">{entry.title}</span>
                    <span
                      className={`text-[10px] flex-shrink-0 font-mono
                        ${isActive ? 'text-indigo-400' : 'text-slate-600 group-hover:text-slate-500'}`}
                    >
                      p{entry.page}
                    </span>
                  </button>
                );
              })
            )}
          </nav>

          <div className="px-3 py-2 border-t border-slate-700">
            <p className="text-[10px] text-slate-600 text-center">
              Haz clic en una sección para navegar
            </p>
          </div>
        </div>

        {/* PDF VIEWER */}
        <div className="flex-1 bg-slate-800 flex items-center justify-center relative">
          {loading && (
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <CircularProgress size={36} sx={{ color: '#6366f1' }} />
              <p className="text-sm">Cargando manual...</p>
            </div>
          )}
          {error && !loading && (
            <div className="flex flex-col items-center gap-3 text-slate-400 max-w-xs text-center">
              <FileText className="w-12 h-12 opacity-40" />
              <p className="text-sm">{error}</p>
              <button
                onClick={() => {
                  setPdfUrl(null);
                  loadedRef.current = false;
                  loadPdf();
                }}
                className="text-indigo-400 text-xs underline hover:text-indigo-300"
              >
                Reintentar
              </button>
            </div>
          )}
          {pdfUrl && !loading && (
            <iframe
              key={iframeKey}
              src={`${pdfUrl}#page=${targetPage}`}
              title={titulo}
              className="w-full h-full border-0"
              style={{ minHeight: 0 }}
            />
          )}
          {activeId && pdfUrl && (
            <div className="absolute top-3 right-3">
              <Chip
                label={toc.find((e) => e.id === activeId)?.title}
                size="small"
                sx={{
                  bgcolor: 'rgba(99, 102, 241, 0.15)',
                  color: '#a5b4fc',
                  border: '1px solid rgba(99,102,241,0.3)',
                  fontSize: '0.65rem',
                  maxWidth: 220,
                  '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                }}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ManualVisor;
