const { spawnSync } = require('node:child_process');
const path = require('node:path');
const entry = path.join(path.dirname(require.resolve('@usebruno/cli/package.json')), 'bin/bru.js');
const result = spawnSync(process.execPath, [entry, 'run', '--env', 'Local', '--sandbox=developer'], {
  cwd: path.resolve(__dirname, '../../../bruno/Task API'), stdio: 'inherit'
});
process.exit(result.status ?? 1);
