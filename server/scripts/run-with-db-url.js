// 跨平台包装器：读取 server/.env，按 DB_* 生成 DATABASE_URL，再执行传入命令。
// 用法：node scripts/run-with-db-url.js npx prisma migrate deploy
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildDatabaseUrl } = require('./build-database-url');

const envPath = process.env.ENV_FILE || path.resolve(__dirname, '..', '.env');

if (fs.existsSync(envPath)) {
  const text = fs.readFileSync(envPath, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

process.env.DATABASE_URL = buildDatabaseUrl(process.env);

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('缺少要执行的命令');
  process.exit(1);
}

const result = spawnSync(command, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
