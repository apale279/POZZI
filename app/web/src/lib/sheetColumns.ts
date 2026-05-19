/** Colonne anagrafiche non gestite dall'app (identificazione paziente esterna). */
export const HIDDEN_SHEET_COLUMNS = new Set(['SDO', 'COGNOME', 'NOME'])

export function isHiddenSheetColumn(column: string): boolean {
  return HIDDEN_SHEET_COLUMNS.has(column.trim().toUpperCase())
}

export function filterSheetColumns(columns: string[]): string[] {
  return columns.filter((c) => !isHiddenSheetColumn(c))
}
