/**
 * downloadCsvTemplate — Utility to download CSV templates
 */

import { TEMPLATE_EXAMPLES, TEMPLATE_HEADERS } from '@/types/csvImport';
import type { CatalogType } from '@/types/csvImport';

export function downloadCsvTemplate(type: CatalogType): void {
  const examples = TEMPLATE_EXAMPLES[type];
  const headers = TEMPLATE_HEADERS[type].join(',');
  const rows = examples.map((ex) => Object.values(ex).join(','));
  const csv = [headers, ...rows].join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `plantilla-${type}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}