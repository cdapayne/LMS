const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '66.45.23.10',
  user: process.env.DB_USER || 'mdtsapps_mdviewer',
  password: process.env.DB_PASS || 'TheMadden04!',
  database: process.env.DB_NAME || 'mdtsapps_myclass',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;