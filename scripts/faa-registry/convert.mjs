// Converts the FAA releasable aircraft database (MASTER.txt + ACFTREF.txt from
// https://registry.faa.gov/database/ReleasableAircraft.zip) into two CSV files
// matching public.faa_registry_staging and public.faa_aircraft_ref_staging.
//
// Usage: node scripts/faa-registry/convert.mjs <dir with MASTER.txt and ACFTREF.txt> <out dir>
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const [inDir, outDir] = process.argv.slice(2);
if (!inDir || !outDir) {
  console.error('Usage: node convert.mjs <input dir> <output dir>');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

// FAA files are comma-separated with a header row, space-padded, unquoted.
function splitLine(line) {
  return line.replace(/^(\uFEFF|\u00EF\u00BB\u00BF)/, '').split(',').map((v) => v.trim());
}
const csv = (v) => (v == null || v === '' ? '' : /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const date = (v) => (/^\d{8}$/.test(v ?? '') ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : '');
const int = (v) => (/^\d+$/.test(v ?? '') ? String(Number(v)) : '');

async function convert(file, out, pick) {
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(inDir, file), 'latin1'), crlfDelay: Infinity });
  const w = fs.createWriteStream(path.join(outDir, out));
  let header = null;
  let rows = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const cells = splitLine(line);
    if (!header) {
      header = Object.fromEntries(cells.map((h, i) => [h.toUpperCase(), i]));
      continue;
    }
    const get = (name) => {
      const i = header[name];
      if (i === undefined) throw new Error(`${file}: missing column "${name}"`);
      return cells[i] ?? '';
    };
    const row = pick(get);
    if (!row) continue;
    w.write(row.map(csv).join(',') + '\n');
    rows++;
  }
  await new Promise((resolve) => w.end(resolve));
  return rows;
}

// public.faa_registry column order.
const aircraft = await convert('MASTER.txt', 'registry.csv', (get) => {
  const n = get('N-NUMBER').toUpperCase();
  if (!/^[1-9][0-9A-Z]{0,4}$/.test(n)) return null;
  return [
    n, get('SERIAL NUMBER'), get('MFR MDL CODE'), int(get('YEAR MFR')), get('TYPE REGISTRANT'), get('NAME'),
    get('CITY'), get('STATE'), get('COUNTRY'), date(get('CERT ISSUE DATE')), get('TYPE AIRCRAFT'), get('TYPE ENGINE'),
    get('STATUS CODE'), date(get('AIR WORTH DATE')), date(get('EXPIRATION DATE')),
  ];
});

// public.faa_aircraft_ref column order.
const models = await convert('ACFTREF.txt', 'models.csv', (get) => {
  const code = get('CODE');
  if (!code) return null;
  return [code, get('MFR'), get('MODEL'), get('TYPE-ACFT'), get('TYPE-ENG'), get('AC-CAT'), int(get('NO-ENG')), int(get('NO-SEATS')), get('AC-WEIGHT')];
});

console.log(`FAA registry: ${aircraft} aircraft, ${models} models`);
