import * as SQLite from 'expo-sqlite';

const VALID_TABLES = ['wound_records', 'ostomy_records', 'intake_output', 'vitals', 'compression_measurements'] as const;
type ValidTable = typeof VALID_TABLES[number];

function isValidTable(table: string): table is ValidTable {
  return (VALID_TABLES as readonly string[]).includes(table);
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const database = await SQLite.openDatabaseAsync('emis_medical.db');
      await initSchema(database);
      return database;
    })().catch(err => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

async function initSchema(database: SQLite.SQLiteDatabase) {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS wound_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      location TEXT,
      length REAL,
      width REAL,
      depth REAL,
      exudate TEXT,
      tissue_type TEXT,
      notes TEXT,
      photo_uri TEXT
    );
    CREATE TABLE IF NOT EXISTS ostomy_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      output_type TEXT,
      output_amount REAL,
      appliance_change INTEGER DEFAULT 0,
      skin_condition TEXT,
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS intake_output (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time TEXT,
      type TEXT NOT NULL,
      category TEXT,
      amount REAL,
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS vitals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      time TEXT,
      systolic INTEGER,
      diastolic INTEGER,
      heart_rate INTEGER,
      temperature REAL,
      oxygen_saturation INTEGER,
      blood_sugar REAL,
      blood_sugar_unit TEXT,
      weight REAL,
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS compression_measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      leg TEXT,
      ankle REAL,
      calf REAL,
      thigh REAL,
      length REAL,
      recommended_size TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_wound_date ON wound_records(date DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_ostomy_date ON ostomy_records(date DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_io_date ON intake_output(date DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_vitals_date ON vitals(date DESC, id DESC);
  `);
}

export async function insertRecord(table: string, record: Record<string, unknown>): Promise<number | undefined> {
  if (!isValidTable(table)) throw new Error(`Invalid table: ${table}`);
  const database = await getDb();
  const keys = Object.keys(record);
  const placeholders = keys.map(() => '?').join(', ');
  const values = keys.map(k => {
    const v = record[k];
    return typeof v === 'boolean' ? (v ? 1 : 0) : v;
  });
  const result = await database.runAsync(
    `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
    values as any[]
  );
  return result.lastInsertRowId;
}

export async function getRecords(table: string, limit = 100): Promise<any[]> {
  if (!isValidTable(table)) throw new Error(`Invalid table: ${table}`);
  const database = await getDb();
  return await database.getAllAsync(`SELECT * FROM ${table} ORDER BY date DESC, id DESC LIMIT ?`, [limit]);
}

export async function deleteRecord(table: string, id: number) {
  if (!isValidTable(table)) throw new Error(`Invalid table: ${table}`);
  const database = await getDb();
  await database.runAsync(`DELETE FROM ${table} WHERE id = ?`, [id]);
}

export async function exportAllData(): Promise<string> {
  const database = await getDb();
  const all: Record<string, any[]> = {};
  for (const table of VALID_TABLES) {
    all[table] = await database.getAllAsync(`SELECT * FROM ${table} ORDER BY date DESC`);
  }
  return JSON.stringify({ exportedAt: new Date().toISOString(), appVersion: '1.0.0', data: all }, null, 2);
}

export async function importData(jsonStr: string): Promise<{ imported: number }> {
  const parsed = JSON.parse(jsonStr);
  if (!parsed.data || typeof parsed.data !== 'object') {
    throw new Error('Invalid backup file format');
  }
  const database = await getDb();
  let count = 0;
  await database.withTransactionAsync(async () => {
    for (const [table, records] of Object.entries(parsed.data)) {
      if (!isValidTable(table)) continue;
      for (const record of records as any[]) {
        const { id, ...fields } = record;
        await insertRecord(table, fields);
        count++;
      }
    }
  });
  return { imported: count };
}

export async function clearAllMedicalData() {
  const database = await getDb();
  await database.execAsync(`
    DELETE FROM wound_records;
    DELETE FROM ostomy_records;
    DELETE FROM intake_output;
    DELETE FROM vitals;
    DELETE FROM compression_measurements;
  `);
}
