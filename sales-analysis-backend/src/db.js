// db.js
import sql from 'mssql';

// Validate required environment variables
function validateConfig() {
  const required = ['DB_SERVER', 'DB_DATABASE', 'DB_USER', 'DB_PASSWORD'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required database environment variables: ${missing.join(', ')}`);
  }
}

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    enableArithAbort: true,
    requestTimeout: 30000
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let poolPromise;

export function getPool() {
  validateConfig();

  if (!poolPromise) {
    poolPromise = sql.connect(config).catch(err => {
      console.error('SQL Server connection error:', err);
      console.error('Connection config:', {
        server: config.server,
        database: config.database,
        user: config.user,
        encrypt: config.options.encrypt,
        trustServerCertificate: config.options.trustServerCertificate
      });
      poolPromise = undefined;
      throw new Error(`Database connection failed: ${err.message}`);
    });
  }
  return poolPromise;
}

export async function runQuery(query, params = {}) {
  try {
    const pool = await getPool();
    const request = pool.request();

    Object.entries(params).forEach(([key, value]) => {
      request.input(key, value);
    });

    const result = await request.query(query);
    return result.recordset;
  } catch (err) {
    console.error('Query execution error:', err);
    console.error('Query:', query);
    throw new Error(`Query execution failed: ${err.message}`);
  }
}
