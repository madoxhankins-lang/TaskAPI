const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const envFile = path.join(root, '.env');
if (!fs.existsSync(envFile)) {
  const template = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  fs.writeFileSync(envFile, template
    .replace('replace-with-at-least-32-random-characters', randomBytes(48).toString('hex'))
    .replace('replace-with-a-long-local-password', randomBytes(18).toString('base64url')));
  console.log('Created private .env with a random JWT secret and admin password.');
} else console.log('Existing .env kept.');
require('dotenv').config({ path: envFile });
const localDir = path.resolve(root, '../../bruno/Task API/environments');
fs.mkdirSync(localDir, { recursive: true });
fs.writeFileSync(path.join(localDir, 'Local.bru'), 'vars {\n  taskApiUrl: http://localhost:' + (process.env.PORT || 3005) + '\n  adminEmail: ' + process.env.ADMIN_EMAIL + '\n  adminPassword: ' + process.env.ADMIN_PASSWORD + '\n}\n');
console.log('Created private Bruno Local environment.');
