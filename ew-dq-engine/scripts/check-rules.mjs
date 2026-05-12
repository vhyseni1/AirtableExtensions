#!/usr/bin/env node
// Offline sanity check: runs all 18 DQ rules against local CSVs and
// compares per-rule counts to the brief's expected values.
//
// Usage:
//   node scripts/check-rules.mjs [data-dir]
//
// Defaults to ../data (relative to this script). Expected CSV filenames:
//   01_EPP.csv, 02_Fieldglass.csv, 03_PurchaseOrders.csv,
//   04_Spend.csv, 07_Valid_Cost_Centers.csv
// (05_Rules.csv and 06_DQ_Results_TEMPLATE.csv are not needed offline.)

import {readFileSync, existsSync} from 'fs';
import {dirname, join, resolve} from 'path';
import {fileURLToPath} from 'url';
import {RULES} from '../frontend/engine/rules.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(process.argv[2] || join(__dirname, '..', 'data'));

const FILES = {
    epp: '01_EPP.csv',
    fg: '02_Fieldglass.csv',
    po: '03_PurchaseOrders.csv',
    spend: '04_Spend.csv',
    validCC: '07_Valid_Cost_Centers.csv',
};

const EXPECTED = {
    R001: 8, R002: 12, R003: 6, R004: 4, R005: 3, R006: 30,
    R007: 7, R008: 5, R009: 10, R010: 14, R011: 3, R012: 6,
    R013: 8, R014: 5, R015: 6, R016: 7, R017: 5, R018: 10,
};

const TOLERANCE = 2;

function parseCSV(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
    const rows = [];
    let row = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') { cur += '"'; i++; }
                else inQuotes = false;
            } else {
                cur += c;
            }
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === ',') {
            row.push(cur); cur = '';
        } else if (c === '\r') {
            // ignore; \n will close the row
        } else if (c === '\n') {
            row.push(cur); rows.push(row); row = []; cur = '';
        } else {
            cur += c;
        }
    }
    if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
    if (rows.length === 0) return [];
    const headers = rows[0].map(h => h.trim());
    return rows.slice(1)
        .filter(r => r.some(v => v !== ''))
        .map(r => {
            const obj = {};
            headers.forEach((h, idx) => { obj[h] = r[idx] !== undefined ? r[idx] : ''; });
            return obj;
        });
}

function loadCSV(filename) {
    const path = join(DATA_DIR, filename);
    if (!existsSync(path)) {
        throw new Error(`CSV not found: ${path}`);
    }
    return parseCSV(readFileSync(path, 'utf8'));
}

function pad(s, n) { return String(s).padStart(n); }

console.log(`Data dir: ${DATA_DIR}\n`);

let sources;
try {
    const eppRows = loadCSV(FILES.epp);
    const fgRows = loadCSV(FILES.fg);
    const poRows = loadCSV(FILES.po);
    const spendRows = loadCSV(FILES.spend);
    const ccRows = loadCSV(FILES.validCC);

    // Coerce FTE to number — CSVs give strings; Number() in R005 handles it,
    // but normalising here keeps parity with the Airtable runtime (which
    // returns numbers from numeric cells).
    for (const r of eppRows) {
        if (r.FTE !== '') r.FTE = Number(r.FTE);
        else r.FTE = null;
    }

    sources = {
        epp: eppRows,
        fg: fgRows,
        po: poRows,
        spend: spendRows.map((r, i) => ({...r, _recordId: `spend-${i}`})),
        validCC: new Set(ccRows.map(r => r.Cost_Center).filter(Boolean)),
    };
} catch (err) {
    console.error(`ERROR loading sources: ${err.message}`);
    process.exit(2);
}

console.log(
    `Loaded EPP=${sources.epp.length} FG=${sources.fg.length} ` +
    `PO=${sources.po.length} Spend=${sources.spend.length} ` +
    `ValidCC=${sources.validCC.size}\n`,
);

console.log('Rule    Actual  Expected   Δ   Status');
console.log('------  ------  --------  ---  ------');

let totalActual = 0;
let totalExpected = 0;
let failures = 0;

const ruleIds = Object.keys(RULES).sort();
for (const id of ruleIds) {
    const exceptions = await RULES[id](sources);
    const actual = exceptions.length;
    const expected = EXPECTED[id] ?? 0;
    const delta = actual - expected;
    const ok = Math.abs(delta) <= TOLERANCE;
    if (!ok) failures++;
    totalActual += actual;
    totalExpected += expected;
    const sign = delta >= 0 ? '+' : '';
    console.log(
        `${id}    ${pad(actual, 4)}    ${pad(expected, 6)}  ${pad(sign + delta, 3)}  ${ok ? 'OK' : 'FAIL'}`,
    );
}

console.log('------  ------  --------  ---  ------');
const totalDelta = totalActual - totalExpected;
const totalSign = totalDelta >= 0 ? '+' : '';
console.log(
    `Total   ${pad(totalActual, 4)}    ${pad(totalExpected, 6)}  ${pad(totalSign + totalDelta, 3)}`,
);

// R009 uniqueness must come in pairs at minimum.
const r009 = await RULES.R009(sources);
if (r009.length % 2 !== 0) {
    console.error(`\nR009 count is odd (${r009.length}) — uniqueness pairs invariant violated.`);
    failures++;
}

if (failures > 0) {
    console.error(`\n${failures} rule(s) outside ±${TOLERANCE} tolerance.`);
    process.exit(1);
}
console.log(`\nAll rules within ±${TOLERANCE} tolerance.`);
