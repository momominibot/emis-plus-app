// Web build of lib/db.ts. expo-sqlite on the web needs SharedArrayBuffer,
// which needs cross-origin isolation headers that GitHub Pages cannot send,
// so the web preview keeps the same records in this browser's localStorage.
// Same API as lib/db.ts. Records never leave the device in either version.

const VALID_TABLES = ['wound_records', 'ostomy_records', 'intake_output', 'vitals', 'compression_measurements'] as const;
type ValidTable = typeof VALID_TABLES[number];
const PREFIX = 'emis_medical:';

function isValidTable(table: string): table is ValidTable {
  return (VALID_TABLES as readonly string[]).includes(table);
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

// Fallback for private windows or blocked storage: records last for this tab only.
const memory: Record<string, any[]> = {};

function read(table: ValidTable): any[] {
  const s = storage();
  if (!s) return memory[table] || [];
  try {
    const raw = s.getItem(PREFIX + table);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function write(table: ValidTable, rows: any[]) {
  const s = storage();
  if (!s) { memory[table] = rows; return; }
  s.setItem(PREFIX + table, JSON.stringify(rows));
}

function newestFirst(a: any, b: any) {
  const d = String(b.date || '').localeCompare(String(a.date || ''));
  return d !== 0 ? d : (b.id || 0) - (a.id || 0);
}

export async function insertRecord(table: string, record: Record<string, unknown>): Promise<number | undefined> {
  if (!isValidTable(table)) throw new Error(`Invalid table: ${table}`);
  const rows = read(table);
  const id = rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
  const row: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(record)) row[k] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
  rows.push(row);
  write(table, rows);
  return id;
}

export async function getRecords(table: string, limit = 100): Promise<any[]> {
  if (!isValidTable(table)) throw new Error(`Invalid table: ${table}`);
  return read(table).sort(newestFirst).slice(0, limit);
}

export async function deleteRecord(table: string, id: number) {
  if (!isValidTable(table)) throw new Error(`Invalid table: ${table}`);
  write(table, read(table).filter(r => r.id !== id));
}

export async function exportAllData(): Promise<string> {
  const all: Record<string, any[]> = {};
  for (const table of VALID_TABLES) all[table] = read(table).sort(newestFirst);
  return JSON.stringify({ exportedAt: new Date().toISOString(), appVersion: '1.0.0', data: all }, null, 2);
}

export async function importData(jsonStr: string): Promise<{ imported: number }> {
  const parsed = JSON.parse(jsonStr);
  if (!parsed.data || typeof parsed.data !== 'object') {
    throw new Error('Invalid backup file format');
  }
  let count = 0;
  for (const [table, records] of Object.entries(parsed.data)) {
    if (!isValidTable(table)) continue;
    for (const record of records as any[]) {
      const { id, ...fields } = record;
      await insertRecord(table, fields);
      count++;
    }
  }
  return { imported: count };
}

export async function clearAllMedicalData() {
  for (const table of VALID_TABLES) write(table, []);
}
