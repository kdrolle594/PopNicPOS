import 'dotenv/config';
import mysql from 'mysql2/promise';

const serviceUri = process.env.MYSQL_URI;

let poolConfig;
if (serviceUri) {
  poolConfig = {
    uri: serviceUri,
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10,
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
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: false,
  };
}

const pool = mysql.createPool(poolConfig);
export default pool;
