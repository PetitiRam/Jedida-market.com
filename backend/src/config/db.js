import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

// SSL: skip it for an obviously-local database (nothing to encrypt to
// yourself, and many local Postgres installs don't have SSL configured at
// all — demanding it would just fail to connect). Everywhere else,
// rejectUnauthorized:false matches what Render/Railway/Supabase-style
// managed Postgres need (their certs aren't in Node's default trust
// store) — set DATABASE_SSL=false to force it off (e.g. a private VPC
// connection) or DATABASE_SSL=strict to turn on real cert verification
// (Neon/most managed providers' certs chain to a public CA already
// trusted by Node, so strict verify-full works there without extra config).
//
// IMPORTANT: node-postgres parses a `sslmode=` query param straight out of
// the connection string and layers it on top of whatever `ssl` object we
// pass — and pg's own libpq-style parser treats 'prefer'/'require'/
// 'verify-ca' as unverified aliases for 'verify-full', which is exactly
// the "SECURITY WARNING" Postgres/Neon logs (those modes don't actually
// validate the cert chain, so coercing them to verify-full silently
// changes behavior). We take explicit control instead: strip any
// `sslmode`/`ssl` query params off the connection string before handing
// it to Pool, and always drive SSL purely from the `ssl` object below —
// no ambiguity, no aliasing warning.
function stripSslParams(connectionString) {
  if (!connectionString) return connectionString;
  try {
    const url = new URL(connectionString);
    url.searchParams.delete('sslmode');
    url.searchParams.delete('ssl');
    return url.toString();
  } catch {
    return connectionString; // not a parseable URL — leave it untouched
  }
}

function resolveSsl(connectionString) {
  if (process.env.DATABASE_SSL === 'false') return false;
  if (process.env.DATABASE_SSL === 'strict') return { rejectUnauthorized: true };
  const isLocal = connectionString
    ? /localhost|127\.0\.0\.1/.test(connectionString)
    : ['localhost', '127.0.0.1', undefined, ''].includes(process.env.PGHOST);
  if (isLocal) return false;
  // Default for managed/Neon-style Postgres: encrypt the connection, but
  // don't hard-fail on a cert chain Node's default trust store might not
  // recognize. This is the modern equivalent of `sslmode=require` without
  // ever asking pg to interpret that string itself.
  return { rejectUnauthorized: false };
}

// DATABASE_URL (the one variable Railway/Render/Heroku/Supabase/Neon all
// set automatically) is all this needs. The individual PGHOST/PGUSER/etc.
// vars still work if that's how an existing deployment is already
// configured — nothing breaks for anyone already running this — but
// DATABASE_URL takes priority when both are present.
const resolvedConnectionString = stripSslParams(process.env.DATABASE_URL);
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: resolvedConnectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      ssl: resolveSsl(process.env.DATABASE_URL)
    })
  : new Pool({
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      max: 10,
      idleTimeoutMillis: 30000,
      ssl: resolveSsl()
    });

export const query = (text, params) => pool.query(text, params);

// Runs `fn` inside a single BEGIN/COMMIT transaction on one dedicated
// client, rolling back on any error. Used for financial operations that
// touch more than one table (wallet balance + ledger entry + status flip)
// so they either all land or none do.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export { pool };

export default pool;
