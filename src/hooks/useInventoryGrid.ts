/**
 * useInventoryGrid Hook — Inventory Grid View logic
 * Handles monthly aggregation queries, grid transforms, filters, exports
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useCatalogos } from '@/hooks/useCatalogos';
import { getMonthlyGridData, getReceptionBreakdown } from '@/services/inventoryAggregator';
import type { Producto } from '@/types';
import type { InventoryMonthly, GridFilters, GridData, GridCell, ReceptionBreakdown } from '@/types/csvImport';

export function useInventoryGrid() {
  const { canQuery } = useAuthorization();
  const { catalogoProductos, catalogoAlmacenes, refreshCatalogos } = useCatalogos();
  
  const [gridData, setGridData] = useState<GridData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [filters, setFiltersState] = useState<GridFilters>({
    warehouseId: catalogoAlmacenes[0]?.id || '',
    year: new Date().getFullYear(),
  });

  // Load grid data when filters change
  const loadGridData = useCallback(async () => {
    if (!canQuery || !filters.warehouseId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const monthlyData = await getMonthlyGridData(filters);
      
      // Transform to grid format
      const productMap = new Map(catalogoProductos.map((p) => [p.id, p]));
      
      // Group by product
      const productGroups = new Map<string, InventoryMonthly[]>();
      for (const item of monthlyData) {
        const existing = productGroups.get(item.productId) || [];
        existing.push(item);
        productGroups.set(item.productId, existing);
      }
      
      // Build grid rows
      const rows: GridCell[] = [];
      
      for (const [productId, items] of productGroups) {
        const product = productMap.get(productId);
        if (!product) continue;
        
        const monthlyCajas = new Array(12).fill(0);
        const monthlyTarimas = new Array(12).fill(0);
        
        for (const item of items) {
          if (item.month >= 1 && item.month <= 12) {
            monthlyCajas[item.month - 1] = item.cajas;
            monthlyTarimas[item.month - 1] = item.tarimas;
          }
        }
        
        const rowTotalCajas = monthlyCajas.reduce((a, b) => a + b, 0);
        const rowTotalTarimas = monthlyTarimas.reduce((a, b) => a + b, 0);
        
        rows.push({
          productId,
          productName: product.nombre,
          productSku: product.sku,
          monthlyCajas,
          monthlyTarimas,
          rowTotalCajas,
          rowTotalTarimas,
        });
      }
      
      // Sort by product name
      rows.sort((a, b) => a.productName.localeCompare(b.productName));
      
      // Calculate column totals
      const columnTotalsCajas = new Array(12).fill(0);
      const columnTotalsTarimas = new Array(12).fill(0);
      
      for (const row of rows) {
        for (let m = 0; m < 12; m++) {
          columnTotalsCajas[m] += row.monthlyCajas[m];
          columnTotalsTarimas[m] += row.monthlyTarimas[m];
        }
      }
      
      const grandTotalCajas = columnTotalsCajas.reduce((a, b) => a + b, 0);
      const grandTotalTarimas = columnTotalsTarimas.reduce((a, b) => a + b, 0);
      
      const data: GridData = {
        rows,
        columnTotalsCajas,
        columnTotalsTarimas,
        grandTotalCajas,
        grandTotalTarimas,
        filters: { ...filters },
        lastUpdated: new Date(),
      };
      
      setGridData(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Error cargando grid'));
    } finally {
      setIsLoading(false);
    }
  }, [canQuery, filters, catalogoProductos]);

  // Auto-load on filter change
  useEffect(() => {
    loadGridData();
  }, [loadGridData]);

  const setFilters = useCallback((newFilters: Partial<GridFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...newFilters }));
  }, []);

  const refresh = useCallback(async () => {
    await refreshCatalogos();
    await loadGridData();
  }, [refreshCatalogos, loadGridData]);

  // Export to CSV
  const exportCsv = useCallback(() => {
    if (!gridData) return;
    
    const headers = ['Producto', 'SKU', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic', 'Total Cajas', 'Total Tarimas'];
    const rows = gridData.rows.map((row) => [
      row.productName,
      row.productSku || '',
      ...row.monthlyCajas.map((v) => (v > 0 ? v : '')),
      row.rowTotalCajas > 0 ? row.rowTotalCajas : '',
      row.rowTotalTarimas > 0 ? row.rowTotalTarimas : '',
    ]);
    
    // Add totals row
    const totalsRow = [
      'TOTAL',
      '',
      ...gridData.columnTotalsCajas.map((v) => (v > 0 ? v : '')),
      gridData.grandTotalCajas > 0 ? gridData.grandTotalCajas : '',
      gridData.grandTotalTarimas > 0 ? gridData.grandTotalTarimas : '',
    ];
    
    const csvContent = [headers, ...rows.map((r) => r.join(',')), totalsRow.join(',')].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `inventario-grid-${filters.warehouseId}-${filters.year}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, [gridData, filters]);

  // Export to PDF (basic implementation)
  const exportPdf = useCallback(async () => {
    if (!gridData) return;
    
    try {
      const { default: jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      
      // Title
      const warehouse = catalogoAlmacenes.find((a) => a.id === filters.warehouseId);
      doc.setFontSize(16);
      doc.text(`Grid Inventario Mensual — ${warehouse?.nombre || filters.warehouseId} — ${filters.year}`, 14, 20);
      
      // Table data
      const tableData = gridData.rows.map((row) => [
        row.productName,
        row.productSku || '',
        ...row.monthlyCajas.map((v) => (v > 0 ? v : '')),
        row.rowTotalCajas > 0 ? row.rowTotalCajas : '',
        row.rowTotalTarimas > 0 ? row.rowTotalTarimas : '',
      ]);
      
      // Add totals row
      tableData.push([
        'TOTAL',
        '',
        ...gridData.columnTotalsCajas.map((v) => (v > 0 ? v : '')),
        gridData.grandTotalCajas > 0 ? gridData.grandTotalCajas : '',
        gridData.grandTotalTarimas > 0 ? gridData.grandTotalTarimas : '',
      ]);
      
      autoTable(doc, {
        head: [['Producto', 'SKU', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic', 'Total Cajas', 'Total Tarimas']],
        body: tableData,
        startY: 30,
        styles: { fontSize: 7, cellPadding: 1 },
        headStyles: { fillColor: [22, 52, 63] },
        alternateRowStyles: { fillColor: [240, 244, 245] },
        columnStyles: {
          0: { cellWidth: 45 },
          1: { cellWidth: 20 },
        },
      });
      
      doc.save(`inventario-grid-${filters.warehouseId}-${filters.year}.pdf`);
    } catch (err) {
      console.error('Error exportando PDF:', err);
      throw new Error('No se pudo generar el PDF');
    }
  }, [gridData, filters, catalogoAlmacenes]);

  // Get breakdown for cell drill-down
  const getBreakdown = useCallback(async (productId: string, month: number): Promise<ReceptionBreakdown | null> => {
    if (!canQuery || !filters.warehouseId) return null;
    
    try {
      const items = await getReceptionBreakdown({
        warehouseId: filters.warehouseId,
        productId,
        year: filters.year,
        month,
      });
      
      const product = catalogoProductos.find((p) => p.id === productId);
      const totalCajas = items.reduce((sum, i) => sum + i.cajas, 0);
      const totalTarimas = items.reduce((sum, i) => sum + i.tarimas, 0);
      
      return {
        productId,
        productName: product?.nombre || 'Desconocido',
        month,
        year: filters.year,
        receptions: items,
        totalCajas,
        totalTarimas,
      };
    } catch (err) {
      console.error('Error getting breakdown:', err);
      return null;
    }
  }, [canQuery, filters, catalogoProductos]);

  return {
    gridData,
    isLoading,
    error,
    filters,
    setFilters,
    exportCsv,
    exportPdf,
    refresh,
    getBreakdown,
  };
}