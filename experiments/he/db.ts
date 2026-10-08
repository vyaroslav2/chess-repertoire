import mysql from "mysql2/promise";

// Connection details come from HE_MYSQL_URL (mysql://he:<password>@127.0.0.1:3306/he),
// so no password lives in the code. Error messages never repeat the URL.
export function mysqlUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.HE_MYSQL_URL;
  if (!url) throw new Error("HE_MYSQL_URL is not set; see the README's MySQL section.");
  if (!/^mysql:\/\/[^:@/]+:[^@]+@[^:/]+:\d+\/\w+$/.test(url)) throw new Error("HE_MYSQL_URL must look like mysql://user:password@host:port/database.");
  return url;
}

export async function connect() {
  return mysql.createConnection(mysqlUrl());
}

export async function checkConnection() {
  const connection = await connect();
  try {
    const [rows] = await connection.query("SELECT VERSION() AS version, CURRENT_USER() AS user, DATABASE() AS db");
    return (rows as { version: string; user: string; db: string }[])[0];
  } finally { await connection.end(); }
}
