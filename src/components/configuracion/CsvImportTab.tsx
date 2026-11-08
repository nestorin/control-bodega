/**
 * CsvImportTab — Main CSV Import UI for Configuracion
 * Handles file selection, preview, validation, commit, templates
 */

import { useState, useCallback, useRef } from 'react';
import { useCsvImport } from '@/hooks/useCsvImport';
import { useImportLog } from '@/hooks/useImportLog';
import { ValidationPreview } from './ValidationPreview';
import { Badge } from './Badge';
import { ImportLogModal } from './ImportLogModal';
import { downloadCsvTemplate } from '@/utils/csvTemplates';
import type { CatalogType, ValidationResult, ImportLog, CsvRow } from '@/types/csvImport';

const CATALOG_TYPES: { value: CatalogType; label: string; icon: string }[] = [
  { value: 'products', label: 'Productos', icon: '📦' },
  { value: 'suppliers', label: 'Proveedores', icon: '🏢' },
  { value: 'conversions', label: 'Conversiones', icon: '🔄' },
  { value: 'warehouses', label: 'Almacenes', icon: '🏪' },
];

const FILTER_TABS: { key: 'all' | 'valid' | 'invalid'; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'valid', label: 'Válidas' },
  { key: 'invalid', label: 'Con errores' },
];

function getRowDisplayName(data: CsvRow | undefined): string {
  if (!data) return 'Sin nombre';
  return (data as any).nombre ?? (data as any).producto ?? (data as any).sku ?? 'Sin nombre';
}

function getRowSku(data: CsvRow | undefined): string | undefined {
  if (!data) return undefined;
  return (data as any).sku;
}

export function CsvImportTab() {
  const {
    previewRows,
    isParsing,
    isCommitting,
    importLog,
    selectedType,
    commitProgress,
    parseFile,
    commitImport,
    downloadTemplate,
    clearPreview,
    setSelectedType,
  } = useCsvImport();
  
  const { logs: importLogs, isLoading: logsLoading, hasMore, loadMore } = useImportLog();
  
  const [filterTab, setFilterTab] = useState<'all' | 'valid' | 'invalid'>('all');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragActiveRef = useRef(false);
  
  const filteredRows = previewRows.filter((row) => {
    if (filterTab === 'all') return true;
    if (filterTab === 'valid') return row.isValid;
    return !row.isValid;
  });
  
  const validCount = previewRows.filter((r) => r.isValid).length;
  const invalidCount = previewRows.length - validCount;
  
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragActiveRef.current = true;
  }, []);
  
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragActiveRef.current = false;
  }, []);
  
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragActiveRef.current = false;
    
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'text/csv' || file.name.endsWith('.csv') || file.name.endsWith('.tsv'))) {
      try {
        await parseFile(file, selectedType);
      } catch (err) {
        console.error('Error parsing file:', err);
        alert('Error al procesar el archivo: ' + (err instanceof Error ? err.message : 'Error desconocido'));
      }
    }
  }, [parseFile, selectedType]);
  
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        await parseFile(file, selectedType);
      } catch (err) {
        console.error('Error parsing file:', err);
        alert('Error al procesar el archivo: ' + (err instanceof Error ? err.message : 'Error desconocido'));
      }
      // Reset input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [parseFile, selectedType]);
  
  const handleCommit = useCallback(async () => {
    try {
      await commitImport();
      alert(`Importación completada: ${importLog?.validRows || 0} filas importadas`);
    } catch (err) {
      console.error('Commit error:', err);
      alert('Error en la importación: ' + (err instanceof Error ? err.message : 'Error desconocido'));
    }
  }, [commitImport, importLog]);
  
  const handleDownloadTemplate = useCallback(() => {
    downloadTemplate(selectedType);
  }, [selectedType]);
  
  const handleClear = useCallback(() => {
    clearPreview();
    setFilterTab('all');
    setExpandedRow(null);
  }, [clearPreview]);
  
  const toggleRowExpand = useCallback((index: number) => {
    setExpandedRow((prev) => (prev === index ? null : index));
  }, []);
  
  // Status badge for import log
  const getStatusBadge = (status: ImportLog['status']) => {
    switch (status) {
      case 'committed': return <Badge label="✓ Completada" color="green" />;
      case 'failed': return <Badge label="✗ Falló" color="red" />;
      default: return <Badge label="⏳ Vista previa" color="blue" />;
    }
  };
  
  return (
    <div className="flex flex-col gap-4 h-full overflow-auto p-4 lg:p-7">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-black text-[#172126] text-[20px] sm:text-[24px]" style={{ fontFamily: "'Inter',sans-serif", fontWeight: 900 }}>
            Importar Catálogo
          </h2>
          <p className="text-[#607078] text-[13px] mt-1" style={{ fontFamily: "'Inter',sans-serif" }}>
            Sube un archivo CSV/TSV para importar datos en lote. Se validarán las filas antes de guardar.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={handleDownloadTemplate}
            disabled={isParsing || isCommitting}
            className="flex items-center gap-2 bg-white border border-[#dce4e7] text-[#16343f] font-bold px-4 py-[9px] rounded-[9px] hover:bg-[#f4f7f8] transition-colors touch-target"
            style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700 }}
          >
            📥 Descargar plantilla
          </button>
          <button
            onClick={() => setShowHistoryModal(true)}
            disabled={isParsing || isCommitting}
            className="flex items-center gap-2 bg-white border border-[#dce4e7] text-[#16343f] font-bold px-4 py-[9px] rounded-[9px] hover:bg-[#f4f7f8] transition-colors touch-target"
            style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700 }}
          >
            📋 Historial
          </button>
        </div>
      </div>
      
      {/* Catalog Type Selector */}
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de catálogo">
        {CATALOG_TYPES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setSelectedType(cat.value)}
            disabled={isParsing || isCommitting}
            role="radio"
            aria-checked={selectedType === cat.value}
            className={`flex items-center gap-2 px-4 py-2 rounded-[10px] whitespace-nowrap text-sm transition-colors font-bold ${
              selectedType === cat.value
                ? 'bg-[#16343f] text-white'
                : 'bg-white border border-[#dce4e7] text-[#607078] hover:bg-[#f4f7f8]'
            }`}
            style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700 }}
          >
            <span>{cat.icon}</span>
            {cat.label}
          </button>
        ))}
      </div>
      
      {/* File Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-3 rounded-[16px] cursor-pointer overflow-hidden transition-all ${
          dragActiveRef.current
            ? 'bg-[#e7f0f2] border-2 border-[#3276a8]'
            : 'bg-white border-2 border-dashed border-[#dce4e7]'
        }`}
        style={{ minHeight: 180 }}
        role="button"
        tabIndex={0}
        aria-label="Zona de carga de archivo CSV"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.txt"
          className="hidden"
          onChange={handleFileChange}
          disabled={isParsing || isCommitting}
        />
        {isParsing ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-3 border-[#3276a8] border-t-transparent rounded-full animate-spin" />
            <p className="font-bold text-[#3276a8] text-[13px]" style={{ fontFamily: "'Inter',sans-serif" }}>
              Procesando archivo...
            </p>
          </div>
        ) : previewRows.length > 0 ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <Badge label="Archivo cargado ✓" color="green" />
            <p className="text-[#607078] text-[13px]" style={{ fontFamily: "'Inter',sans-serif" }}>
              {previewRows.length} filas · {validCount} válidas · {invalidCount} con errores
            </p>
            <button
              onClick={handleClear}
              className="text-[#3276a8] font-bold text-[12px] underline hover:no-underline"
              style={{ fontFamily: "'Inter',sans-serif" }}
            >
              Cambiar archivo
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#3276a8"
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
            <p className="font-bold text-[#3276a8] text-[13px]" style={{ fontFamily: "'Inter',sans-serif" }}>
              Cargar archivo CSV / TSV
            </p>
            <p className="text-[#607078] text-[11px] text-center px-4" style={{ fontFamily: "'Inter',sans-serif" }}>
              Arrastra aquí o haz clic para seleccionar · CSV, TSV · máx 10MB
            </p>
          </div>
        )}
      </div>
      
      {/* Filter Tabs */}
      {previewRows.length > 0 && (
        <div className="flex flex-wrap gap-1 bg-[#f0f4f5] rounded-[10px] p-1" role="tablist">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterTab(tab.key)}
              role="tab"
              aria-selected={filterTab === tab.key}
              className={`px-3 py-[6px] rounded-[8px] text-[11px] font-bold transition-colors ${
                filterTab === tab.key
                  ? 'bg-white text-[#16343f] shadow-[0px_1px_3px_rgba(22,52,63,0.1)]'
                  : 'text-[#607078] hover:bg-white'
              }`}
              style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700 }}
            >
              {tab.label} <Badge label={String(tab.key === 'all' ? previewRows.length : tab.key === 'valid' ? validCount : invalidCount)} color="gray" />
            </button>
          ))}
        </div>
      )}
      
      {/* Preview Table */}
      {previewRows.length > 0 && (
        <div className="bg-white rounded-[12px] border border-[#dce4e7] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#f0f4f5] border-b border-[#dce4e7]">
                  <th className="px-3 py-2 text-[10px] font-bold uppercase text-[#607078]" style={{ fontFamily: "'Inter',sans-serif" }}>#</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase text-[#607078]" style={{ fontFamily: "'Inter',sans-serif" }}>Estado</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase text-[#607078]" style={{ fontFamily: "'Inter',sans-serif" }}>Nombre / SKU</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase text-[#607078]" style={{ fontFamily: "'Inter',sans-serif" }}>Detalles</th>
                  <th className="px-3 py-2 text-[10px] font-bold uppercase text-[#607078]" style={{ fontFamily: "'Inter',sans-serif" }}>Errores</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, displayIndex) => {
                  const originalIndex = previewRows.findIndex((r) => r === row);
                  const isExpanded = expandedRow === originalIndex;
                  return (
                    <tr
                      key={row.rowIndex}
                      className={`border-b border-[#f0f4f5] last:border-0 ${!row.isValid ? 'bg-[#fef8e6]' : ''} ${isExpanded ? 'bg-[#fef8e6]' : ''}`}
                    >
                      <td className="px-3 py-2 text-[12px] text-[#607078] font-mono" style={{ fontFamily: "'Inter',sans-serif" }}>
                        {row.rowIndex}
                      </td>
                      <td className="px-3 py-2">
                        {row.isValid ? (
                          <Badge label="✓ OK" color="green" />
                        ) : (
                          <Badge label="✗ Error" color="red" />
                        )}
                      </td>
                      <td className="px-3 py-2 text-[12px] font-semibold text-[#172126] max-w-xs truncate" style={{ fontFamily: "'Inter',sans-serif" }}>
                        {getRowDisplayName(row.data)}
                        {getRowSku(row.data) && (
                          <span className="text-[#607078] font-normal ml-1 text-[10px]">({getRowSku(row.data)})</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => toggleRowExpand(originalIndex)}
                          className="flex items-center gap-1 text-[#3276a8] text-[11px] font-bold hover:underline"
                          style={{ fontFamily: "'Inter',sans-serif" }}
                        >
                          {isExpanded ? '▲' : '▼'} {isExpanded ? 'Ocultar' : 'Ver'}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        {!row.isValid && (
                          <ValidationPreview validation={row} rowNumber={row.rowIndex} />
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-[13px] text-[#607078]" style={{ fontFamily: "'Inter',sans-serif" }}>
                      No hay filas con este filtro
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {/* Expanded validation details (rendered in ValidationPreview) */}
        </div>
      )}
      
      {/* Commit Bar */}
      {previewRows.length > 0 && validCount > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-white rounded-[12px] border border-[#dce4e7]">
          <div className="flex items-center gap-4">
            <Badge label={`${validCount} filas listas para importar`} color="green" />
            {isCommitting && (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-[#3276a8] border-t-transparent rounded-full animate-spin" />
                <span className="text-[#3276a8] font-bold text-[12px]" style={{ fontFamily: "'Inter',sans-serif" }}>
                  Importando... {commitProgress}%
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleClear}
              disabled={isCommitting}
              className="flex items-center gap-2 bg-white border border-[#dce4e7] text-[#16343f] font-bold px-4 py-[9px] rounded-[9px] hover:bg-[#f4f7f8] transition-colors touch-target"
              style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700 }}
            >
              Cancelar
            </button>
            <button
              onClick={handleCommit}
              disabled={isCommitting}
              className="flex items-center gap-2 bg-[#16343f] border border-[#16343f] text-white font-bold px-4 py-[9px] rounded-[9px] hover:bg-[#1e4456] transition-colors touch-target"
              style={{ fontFamily: "'Inter',sans-serif", fontWeight: 700 }}
            >
              {isCommitting ? 'Importando...' : 'Importar datos'}
            </button>
          </div>
        </div>
      )}
      
      {/* Import Log Modal */}
      {showHistoryModal && (
        <ImportLogModal
          logs={importLogs}
          isLoading={logsLoading}
          hasMore={hasMore}
          loadMore={loadMore}
          onClose={() => setShowHistoryModal(false)}
        />
      )}
    </div>
  );
}