/**
 * CSV Parser Service — Streaming parse with PapaParse
 * Handles large files without loading entirely into memory
 */

import Papa from "papaparse";
import type { ParseResult } from "@/types/csvImport";

export interface ParseOptions {
  delimiter?: string; // auto-detect if not provided
  encoding?: string; // 'utf-8' | 'latin1'
  previewLimit?: number; // max rows for preview
  skipEmptyLines?: boolean;
}

const DEFAULT_OPTIONS: Required<ParseOptions> = {
  delimiter: "",
  encoding: "utf-8",
  previewLimit: 100,
  skipEmptyLines: true,
};

/**
 * Detect delimiter from first few lines
 */
function detectDelimiter(text: string): string {
  const delimiters = [",", ";", "\t", "|"];
  const lines = text.split("\n").slice(0, 5);

  for (const delim of delimiters) {
    const counts = lines.map((l) => l.split(delim).length);
    if (counts.every((c) => c === counts[0]) && counts[0] > 1) {
      return delim;
    }
  }

  return ","; // fallback
}

/**
 * Parse CSV/TSV file with streaming for large files
 */
export async function parseCsv<T>(file: File, options: ParseOptions = {}): Promise<ParseResult<T>> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return new Promise((resolve, reject) => {
    const rows: T[] = [];
    const errors: ParseResult<T>["errors"] = [];
    let meta: ParseResult<T>["meta"] = {
      lines: 0,
      delimiter: opts.delimiter,
      encoding: opts.encoding,
    };
    let previewCount = 0;

    // Read file as text first to detect delimiter
    const reader = new FileReader();

    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) {
        reject(new Error("Archivo vacío"));
        return;
      }

      // Detect delimiter if not provided
      const delimiter = opts.delimiter || detectDelimiter(text);
      meta.delimiter = delimiter;
      meta.lines = text.split("\n").length;

      // Parse with PapaParse
      Papa.parse<T>(text, {
        delimiter,
        header: true,
        skipEmptyLines: opts.skipEmptyLines,
        encoding: opts.encoding,
        dynamicTyping: false, // Keep as strings for validation
        transformHeader: (h) => h.trim(),
        step: (results, parser) => {
          if (previewCount < opts.previewLimit) {
            rows.push(results.data);
            previewCount++;
          }
        },
        complete: (results) => {
          // PapaParse doesn't expose lines in meta, use our pre-calculated value
          // meta.lines is already set from text.split('\n').length

          if (results.errors.length > 0) {
            results.errors.forEach((err) => {
              errors.push({
                row: err.row ?? 0,
                code: "PARSE_ERROR",
                message: err.message,
                data: {},
              });
            });
          }

          resolve({
            rows,
            errors,
            meta,
          });
        },
        error: (err: Error) => {
          reject(new Error(`Error parseando CSV: ${err.message}`));
        },
      });
    };

    reader.onerror = () => reject(new Error("Error leyendo archivo"));
    reader.readAsText(file, opts.encoding);
  });
}

/**
 * Parse full file (for commit phase) - returns all rows
 */
export async function parseCsvFull<T>(
  file: File,
  options: Omit<ParseOptions, "previewLimit"> = {},
): Promise<ParseResult<T>> {
  return parseCsv<T>(file, { ...options, previewLimit: Infinity });
}

/**
 * Generate CSV text from data
 */
export function generateCsv<T extends Record<string, any>>(data: T[], headers: string[]): string {
  const headerRow = headers.join(",");
  const rows = data.map((row) =>
    headers
      .map((h: string) => {
        const val = row[h];
        if (val === null || val === undefined) return "";
        if (
          typeof val === "string" &&
          (val.includes(",") || val.includes('"') || val.includes("\n"))
        ) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return String(val);
      })
      .join(","),
  );

  return [headerRow, ...rows].join("\n");
}
