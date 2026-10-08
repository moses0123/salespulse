/**
 * Minimal RFC-4180-ish CSV parser — handles quoted fields (including embedded
 * commas and escaped `""` quotes) and both \n and \r\n line endings. Good
 * enough for hand-authored or Excel/Sheets-exported CSVs; not a full spec
 * implementation (no multi-line quoted fields spanning many rows edge cases).
 * Returns an array of row objects keyed by the (trimmed, as-given) header.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = splitCsvRows(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => {
      const obj: Record<string, string> = {};
      header.forEach((key, i) => {
        obj[key] = (row[i] ?? "").trim();
      });
      return obj;
    });
}

function splitCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const char = src[i];
    if (inQuotes) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Look up a value in a parsed CSV row by any of several acceptable header spellings (case-insensitive). */
export function pickField(row: Record<string, string>, ...names: string[]): string | undefined {
  const lowerMap = new Map(Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), v]));
  for (const name of names) {
    const v = lowerMap.get(name.toLowerCase());
    if (v !== undefined) return v;
  }
  return undefined;
}
