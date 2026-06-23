const fs = require('fs');
const path = require('path');

function normalizeSpaces(s) {
  return (s || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n+ */g, '\n')
    .trim();
}

function compactName(s) {
  return normalizeSpaces(s).replace(/\s+/g, '');
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function formatNow(timezone = 'Asia/Seoul') {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date()).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function signatureOf(items) {
  return items.map(i => `${i.id}|${normalizeSpaces(i.status || '')}`).sort().join('||');
}

function idsFromSignature(signature) {
  return new Set((signature || '').split('||').map(part => part.split('|')[0]).filter(Boolean));
}

function redactPatient(item, index) {
  return {
    ...item,
    name: `patient-${index + 1}`,
    id: `redacted-${index + 1}`,
  };
}

function parseArgs(argv) {
  const booleanFlags = new Set(['confirm', 'help']);
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      out._.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    if (booleanFlags.has(key)) {
      out[key] = true;
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'"'"'`)}'`;
}

module.exports = {
  normalizeSpaces,
  compactName,
  readJson,
  writeJson,
  formatNow,
  signatureOf,
  idsFromSignature,
  redactPatient,
  parseArgs,
  shellQuote,
};
