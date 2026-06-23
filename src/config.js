const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath = path.resolve(process.cwd(), '.env')) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function bool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return /^(1|true|yes|y|on)$/i.test(String(value).trim());
}

function int(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function makeConfig(envPath = path.resolve(process.cwd(), '.env'), extraEnv = process.env) {
  const env = { ...loadEnvFile(envPath), ...extraEnv };
  const cwd = process.cwd();
  const stateDir = path.resolve(cwd, env.STATE_DIR || './state');
  return {
    envPath,
    username: env.VIP_USERNAME || '',
    password: env.VIP_PASSWORD || '',
    loginUrl: env.VIP_LOGIN_URL || 'https://vip.invisalign.com/v3/auth/patients.action',
    patientListUrl: env.VIP_PATIENT_LIST_URL || 'https://vip.invisalign.com/v3/auth/patient/patientList.action',
    headless: bool(env.HEADLESS, true),
    slowMoMs: int(env.SLOW_MO_MS, 0),
    stateDir,
    timezone: env.TIMEZONE || 'Asia/Seoul',
    actionRequiredNotifyEmpty: bool(env.ACTION_REQUIRED_NOTIFY_EMPTY, false),
    actionRequiredRedactPatients: bool(env.ACTION_REQUIRED_REDACT_PATIENTS, false),
    actionRequiredCron: env.ACTION_REQUIRED_CRON || '*/30 * * * *',
  };
}

function requireCredentials(config) {
  if (!config.username || !config.password) {
    throw new Error(`Missing VIP credentials. Copy .env.example to .env and set VIP_USERNAME/VIP_PASSWORD. Env path: ${config.envPath}`);
  }
}

module.exports = { loadEnvFile, makeConfig, requireCredentials, bool, int };
