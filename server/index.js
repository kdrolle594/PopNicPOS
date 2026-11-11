import 'dotenv/config';
import app from './app.js';
import pool from './db.js';

try {
  const conn = await pool.getConnection();
  console.log(`✔  Connected to Postgres at ${new URL(process.env.DATABASE_URL).host}`);
  conn.release();
} catch (err) {
  console.warn('Database connection failed on startup:', err.message);
  console.warn('API server will still start; database routes may fail until DB is reachable.');
}

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`✔  API server listening on http://localhost:${PORT}`);
});
