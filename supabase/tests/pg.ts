// Test helper: a fresh database per test, cloned from loyalty_template
// (created and migrated by run.sh as the non-superuser owner).

import postgres from 'npm:postgres@3.4.9';
import { createLoyaltyDb, type LoyaltyDbConnection } from '../functions/_shared/db.ts';

export const PG_HOST = Deno.env.get('TEST_PG_HOST');
export const PG_PORT = Number(Deno.env.get('TEST_PG_PORT') || 0);
/** Database tests only run under run.sh, which provides the cluster. */
export const NO_DB = !PG_HOST;

let counter = 0;

export interface TestDb {
  url: string;
  sql: postgres.Sql;
  db: LoyaltyDbConnection;
  as(role: 'anon' | 'authenticated' | 'service_role'): Promise<postgres.Sql>;
  drop(): Promise<void>;
}

export async function freshDb(): Promise<TestDb> {
  const name = `t_${Deno.pid}_${counter++}`;
  const admin = postgres({ host: PG_HOST, port: PG_PORT, user: 'postgres', database: 'postgres', max: 1, onnotice: () => {} });
  await admin.unsafe(`create database ${name} template loyalty_template owner loyalty_owner`);
  const url = `postgres://loyalty_owner@${PG_HOST}:${PG_PORT}/${name}`;
  const sql = postgres(url, { max: 4, prepare: false, onnotice: () => {} });
  const db = createLoyaltyDb(url, { max: 12 });
  const extra: postgres.Sql[] = [];
  return {
    url,
    sql,
    db,
    async as(role) {
      const conn = postgres({ host: PG_HOST, port: PG_PORT, user: 'api_user', database: name, max: 1, onnotice: () => {} });
      await conn.unsafe(`set role ${role}`);
      extra.push(conn);
      return conn;
    },
    async drop() {
      await Promise.all([sql.end(), db.end(), ...extra.map((c) => c.end())]);
      await admin.unsafe(`drop database ${name} with (force)`);
      await admin.end();
    },
  };
}

/** Runs fn against a fresh database and always drops it. */
export function dbTest(name: string, fn: (t: TestDb) => Promise<void>) {
  Deno.test({
    name,
    ignore: NO_DB,
    sanitizeOps: false,
    sanitizeResources: false,
    async fn() {
      const t = await freshDb();
      try {
        await fn(t);
      } finally {
        await t.drop();
      }
    },
  });
}
