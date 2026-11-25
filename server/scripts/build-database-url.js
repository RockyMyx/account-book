// 用 DB_* 环境变量生成 Prisma 需要的 DATABASE_URL。
// 密码按 URL 规则编码，避免 @ : / # 等字符破坏连接串。
function buildDatabaseUrl(env = process.env) {
  const user = encodeURIComponent(env.DB_USER || 'root');
  const password = encodeURIComponent(env.DB_PASSWORD || '');
  const host = env.DB_HOST || '127.0.0.1';
  const port = env.DB_PORT || '3306';
  const database = env.DB_NAME || 'accountbook';
  return `mysql://${user}:${password}@${host}:${port}/${database}`;
}

if (require.main === module) {
  console.log(buildDatabaseUrl());
}

module.exports = { buildDatabaseUrl };
