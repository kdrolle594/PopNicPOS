import 'dotenv/config';
import pg from 'pg';
import { toPg, mapError, shapeResult } from './lib/sql.js';

// Postgres (Supabase). The routes were written against mysql2, so this module
// keeps that API: query(sql, params) with `?` placeholders resolves to
// [rows] for reads and [{ insertId, affectedRows, rows }] for writes, and
// getConnection() gives a client with beginTransaction/commit/rollback/release.

// BIGINT ids and COUNT(*) arrive as strings by default; the app compares ids
// as numbers (all well under 2^53). NUMERIC stays a string, as with mysql2.
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

const connectionString = process.env.DATABASE_URL;

// Prefer verified TLS: set DATABASE_CA to the Supabase CA certificate (PEM, or
// base64 PEM). Without it TLS still encrypts but the certificate is not checked.
function sslConfig() {
  const ca = process.env.DATABASE_CA;
  if (!ca) {
    console.warn('DATABASE_CA not set — TLS certificate verification is DISABLED for Postgres.');
    return { rejectUnauthorized: false };
  }
  const pem = ca.includes('-----BEGIN') ? ca : Buffer.from(ca, 'base64').toString('utf8');
  return { ca: pem, rejectUnauthorized: true };
}

const pgPool = new pg.Pool({
  connectionString,
  ssl: connectionString && !/localhost|127\.0\.0\.1/.test(connectionString) ? sslConfig() : false,
  max: 3,
  idleTimeoutMillis: 10_000,
});
// Timestamps are TIMESTAMPTZ, so values round-trip as exact instants whatever
// the session time zone is.

try {
  if (connectionString) console.log(`Postgres target host: ${new URL(connectionString).host}`);
} catch { /* unparsable URL; pg reports it on first use */ }

async function run(client, sql, params) {
  const { text, values } = toPg(sql, params);
  try {
    return shapeResult(await client.query(text, values));
  } catch (err) {
    throw mapError(err);
  }
}

function wrapClient(client) {
  return {
    query: (sql, params) => run(client, sql, params),
    beginTransaction: () => client.query('BEGIN'),
    commit: () => client.query('COMMIT'),
    rollback: () => client.query('ROLLBACK').catch(() => {}),
    release: () => client.release(),
  };
}

const pool = {
  query: (sql, params) => run(pgPool, sql, params),
  getConnection: async () => wrapClient(await pgPool.connect()),
  end: () => pgPool.end(),
};

export default pool;
