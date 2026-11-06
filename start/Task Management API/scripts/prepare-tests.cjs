const { spawnSync } = require('node:child_process');
const path = require('node:path');
const app = path.resolve(__dirname, '..');
const root = path.resolve(app, '../..');
const databaseUrl = 'postgresql://taskapi:taskapi_local@localhost:5435/taskapi_test';
function run(command, args, cwd, env) {
  const result = spawnSync(command, args, { cwd, env: env || process.env, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const check = spawnSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'taskapi', '-d', 'postgres', '-tAc', "SELECT 1 FROM pg_database WHERE datname='taskapi_test'"], { cwd: root, encoding: 'utf8' });
if (check.status !== 0) { console.error('Start PostgreSQL and Redis with docker compose up -d postgres redis first.'); process.exit(1); }
if (!check.stdout.trim()) run('docker', ['compose', 'exec', '-T', 'postgres', 'createdb', '-U', 'taskapi', 'taskapi_test'], root);
const prismaCli = path.join(path.dirname(require.resolve('prisma/package.json')), 'build/index.js');
run(process.execPath, [prismaCli, 'migrate', 'deploy'], app, { ...process.env, DATABASE_URL: databaseUrl });
console.log('Local integration database ready. CI uses its own service database.');
