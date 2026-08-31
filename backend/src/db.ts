import pg from 'pg';

for (const name of ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']) {
  if (!process.env[name]) {
    throw new Error(`Missing database configuration: ${name}`);
  }
}

export const pool = new pg.Pool({
  max: 5,
  connectionTimeoutMillis: 5000,
  statement_timeout: 5000,
});

pool.on('error', () => {
  console.error('An idle database connection failed.');
});