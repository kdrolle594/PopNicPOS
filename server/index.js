import 'dotenv/config';
import app from './app.js';
import pool from './db.js';

try {
  const conn = await pool.getConnection();
  const host = process.env.MYSQL_URI
    ? new URL(process.env.MYSQL_URI).host
    : `${process.env.MYSQL_HOST}:${process.env.MYSQL_PORT}`;
  console.log(`✔  Connected to MySQL at ${host}`);
  conn.release();
} catch (err) {
  console.warn('MySQL connection failed on startup:', err.message);
  console.warn('API server will still start; database routes may fail until DB is reachable.');
}

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`✔  API server listening on http://localhost:${PORT}`);
});
