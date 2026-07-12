import 'dotenv/config';
import mysql from 'mysql2/promise';

const serviceUri = process.env.MYSQL_URI;

// Prefer verified TLS: set MYSQL_CA to the Aiven CA certificate (PEM contents,
// or a base64-encoded PEM for env-var friendliness). Without it we fall back
// to unverified TLS, which encrypts but is open to man-in-the-middle.
function sslConfig() {
  const ca = process.env.MYSQL_CA;
  if (!ca) {
    console.warn('MYSQL_CA not set — TLS certificate verification is DISABLED for MySQL.');
    return { rejectUnauthorized: false };
  }
  const pem = ca.includes('-----BEGIN')
    ? ca
    : Buffer.from(ca, 'base64').toString('utf8');
  return { ca: pem, rejectUnauthorized: true };
}

let poolConfig;
if (serviceUri) {
  poolConfig = {
    uri: serviceUri,
    ssl: sslConfig(),
    waitForConnections: true,
    connectionLimit: 3,
    queueLimit: 0,
    dateStrings: false,
  };
} else {
  poolConfig = {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE || 'defaultdb',
    ssl: sslConfig(),
    waitForConnections: true,
    connectionLimit: 3,
    queueLimit: 0,
    dateStrings: false,
  };
}

// Log the target host (never credentials) so deploy logs show which
// provider/instance this environment actually connects to.
try {
  const host = serviceUri
    ? new URL(serviceUri).host
    : `${poolConfig.host}:${poolConfig.port}`;
  console.log(`MySQL target host: ${host}`);
} catch {
  console.warn('MySQL target host could not be parsed from MYSQL_URI');
}

const pool = mysql.createPool(poolConfig);
export default pool;
