import sql from 'mssql';

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true'
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let poolPromise;

export function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(config).catch(err => {
      console.error('SQL Server connection error:', err);
      poolPromise = undefined;
      throw err;
    });
  }
  return poolPromise;
}

export async function runQuery(query, params = {}) {
  const pool = await getPool();
  const request = pool.request();

  Object.entries(params).forEach(([key, value]) => {
    request.input(key, value);
  });

  const result = await request.query(query);
  return result.recordset;
}


