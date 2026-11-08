/**
 * ImportLogModal — History modal for CSV imports
 */

import { useState } from 'react';
import type { ImportLog } from '@/types/csvImport';
import { Badge } from './Badge';
import { ValidationPreview } from './ValidationPreview';

interface ImportLogModalProps {
  logs: ImportLog[];
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  onClose: () => void;
}

function LogRow({ log, expandedLog, setExpandedLog }: {
  log: ImportLog;
  expandedLog: string | null;
  setExpandedLog: (updater: string | null | ((prev: string | null) => string | null)) => void;
}) {
  const isExpanded = expandedLog === log.id;
  
  const handleClick = () => {
    setExpandedLog((prev: string | null) => (prev === log.id ? null : log.id));
  };
  
  return (
    <div
      key={log.id}
      className="bg-white border border-[#dce4e7] rounded-[12px] overflow-hidden"
    >
      {/* Log summary row */}
      <div
        className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 cursor-pointer transition-colors ${
          isExpanded ? 'bg-[#fef8e6] border-b border-[#f2b84b]' : 'hover:bg-[#fafbfc]'
        }`}
        onClick={handleClick}
        style={{ minHeight: 80 }}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className={`size-10 rounded-[10px] flex items-center justify-center shrink-0 ${
              log.status === 'committed' ? 'bg-[#e2f5ec]' :
              log.status === 'failed' ? 'bg-[#fdecea]' : 'bg-[#e8eef6]'
            }`}
          >
            {log.type === 'products' && '📦'}
            {log.type === 'suppliers' && '🏢'}
            {log.type === 'conversions' && '🔄'}
            {log.type === 'warehouses' && '🏪'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p
                className="font-bold text-[#172126] text-[13px] lg:text-[14px] truncate"
                style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700 }}
              >
                {getTypeLabel(log.type)}
              </p>
              <span className="text-[10px] lg:text-[11px] text-[#607078] truncate" style={{ fontFamily: "'Inter',sans-serif" }}>
                {log.fileName}
              </span>
              <span className="text-[10px] lg:text-[11px] text-[#aab8be] truncate" style={{ fontFamily: "'Inter',sans-serif" }}>
                {formatDate(log.createdAt)}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {log.status === 'committed' && <Badge label={`✓ ${log.validRows} OK`} color="green" />}
              {log.status === 'failed' && <Badge label={`✗ ${log.invalidRows} fallaron`} color="red" />}
              {log.status === 'preview' && <Badge label={`⏳ ${log.validRows} válidas, ${log.invalidRows} errores`} color="blue" />}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:w-auto w-full sm:min-w-[200px] text-right sm:text-right">
          <div className="flex flex-col items-end gap-1">
            <p className="font-bold text-[#172126] text-[13px] lg:text-[14px]" style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700 }}>
              {log.validRows + log.invalidRows} filas
            </p>
            <p className="text-[11px] lg:text-[12px] text-[#607078]" style={{ fontFamily: "'Inter',sans-serif" }}>
              {log.validRows} válidas · {log.invalidRows} errores
            </p>
          </div>
          <span className="text-[10px] text-[#aab8be] shrink-0" style={{ fontFamily: "'Inter',sans-serif" }}>
            {isExpanded ? '▲' : '▼'}
          </span>
        </div>
      </div>
      
      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-[#f0f4f5] bg-[#fafbfc] px-5 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase text-[#607078] mb-1" style={{ fontFamily: "'Inter',sans-serif" }}>Archivo</p>
              <p className="text-[12px] text-[#172126] truncate" style={{ fontFamily: "'Inter',sans-serif" }}>{log.fileName}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-[#607078] mb-1" style={{ fontFamily: "'Inter',sans-serif" }}>Tamaño</p>
              <p className="text-[12px] text-[#172126]" style={{ fontFamily: "'Inter',sans-serif" }}>{(log.fileSize / 1024).toFixed(1)} KB</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-[#607078] mb-1" style={{ fontFamily: "'Inter',sans-serif" }}>Usuario</p>
              <p className="text-[12px] text-[#172126]" style={{ fontFamily: "'Inter',sans-serif" }}>{log.userName}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase text-[#607078] mb-1" style={{ fontFamily: "'Inter',sans-serif" }}>Fecha</p>
              <p className="text-[12px] text-[#172126]" style={{ fontFamily: "'Inter',sans-serif" }}>{formatDate(log.createdAt)}</p>
            </div>
          </div>
          
          {log.errors.length > 0 && (
            <div>
              <p className="font-bold text-[#172126] text-[12px] mb-2" style={{ fontFamily: "'Inter',sans-serif" }}>
                Errores ({log.errors.length})
              </p>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {log.errors.slice(0, 50).map((err, i) => (
                  <ValidationPreview
                    key={`${log.id}-${i}`}
                    validation={{
                      rowIndex: err.row,
                      data: err.data as any,
                      isValid: false,
                      errors: [{ code: err.code, message: err.message, column: undefined }],
                    }}
                    rowNumber={err.row}
                  />
                ))}
                {log.errors.length > 50 && (
                  <p className="text-[11px] text-[#607078] mt-2" style={{ fontFamily: "'Inter',sans-serif" }}>
                    ... y {log.errors.length - 50} errores más
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Main modal component
// ============================================

export function ImportLogModal({ logs, isLoading, hasMore, loadMore, onClose }: ImportLogModalProps) {
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(22,52,63,0.35)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-log-title"
    >
      <div className="bg-white rounded-[20px] shadow-[0px_20px_60px_rgba(22,52,63,0.25)] w-full max-w-[900px] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 lg:px-6 py-4 border-b border-[#dce4e7] shrink-0">
          <p
            id="import-log-title"
            className="font-black text-[#172126] text-[16px] lg:text-[18px]"
            style={{ fontFamily: "'Inter',sans-serif", fontWeight: 900 }}
          >
            Historial de Importaciones
          </p>
          <button
            onClick={onClose}
            className="flex items-center justify-center size-9 lg:size-8 rounded-[8px] hover:bg-[#f4f7f8] transition-colors text-[#607078] touch-target"
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <div className="overflow-y-auto flex-1 px-5 lg:px-6 py-5">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <svg
                width="64"
                height="64"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#607078"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <p className="text-[13px] lg:text-[14px] font-bold text-[#607078]" style={{ fontFamily: "'Inter',sans-serif" }}>
                Sin importaciones registradas
              </p>
              <p className="text-[12px] text-[#aab8be] text-center px-4" style={{ fontFamily: "'Inter',sans-serif" }}>
                Las importaciones aparecerán aquí después de procesar un archivo CSV.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <LogRow
                  key={log.id}
                  log={log}
                  expandedLog={expandedLog}
                  setExpandedLog={setExpandedLog}
                />
              ))}
              {hasMore && (
                <div className="flex justify-center pt-4">
                  <button
                    onClick={loadMore}
                    disabled={isLoading}
                    className="flex items-center gap-2 bg-white border border-[#dce4e7] text-[#16343f] font-bold px-4 py-[9px] rounded-[9px] hover:bg-[#f4f7f8] transition-colors touch-target"
                    style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700 }}
                  >
                    {isLoading ? 'Cargando...' : 'Cargar más'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Utility functions (at bottom, no duplicates)
// ============================================

function getTypeLabel(type: ImportLog['type']): string {
  switch (type) {
    case 'products': return '📦 Productos';
    case 'suppliers': return '🏢 Proveedores';
    case 'conversions': return '🔄 Conversiones';
    case 'warehouses': return '🏪 Almacenes';
  }
}

function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}