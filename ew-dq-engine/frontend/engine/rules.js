function blank(v) {
    if (v === null || v === undefined) return true;
    if (typeof v === 'string') return v.trim() === '';
    return false;
}

function asString(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object' && 'name' in v) return v.name;
    return String(v);
}

function ownerMeta(row) {
    return {
        Owner_RRP: row.RRP_ID || '',
        Supplier_ID: row.Supplier_ID || '',
        Roche_Country: row.Roche_Country || '',
    };
}

async function R001(sources) {
    const out = [];
    for (const row of sources.epp) {
        if (blank(row.PO_Number)) {
            out.push({Record_ID: row.Worker_ID, Field: 'PO_Number', Expected: 'not blank', Actual: '', ...ownerMeta(row)});
        }
    }
    return out;
}

async function R002(sources) {
    const out = [];
    for (const row of sources.epp) {
        if (blank(row.Country_of_Residence)) {
            out.push({Record_ID: row.Worker_ID, Field: 'Country_of_Residence', Expected: 'not blank', Actual: '', ...ownerMeta(row)});
        }
    }
    return out;
}

async function R003(sources) {
    const out = [];
    for (const row of sources.epp) {
        if (blank(row.Capability)) {
            out.push({Record_ID: row.Worker_ID, Field: 'Capability', Expected: 'not blank', Actual: '', ...ownerMeta(row)});
        }
    }
    return out;
}

async function R004(sources) {
    const out = [];
    for (const row of sources.epp) {
        const s = asString(row.Start_Date);
        const e = asString(row.End_Date);
        if (!s || !e) continue;
        if (!(e > s)) {
            out.push({Record_ID: row.Worker_ID, Field: 'End_Date', Expected: `> ${s}`, Actual: e, ...ownerMeta(row)});
        }
    }
    return out;
}

async function R005(sources) {
    const out = [];
    for (const row of sources.epp) {
        const fte = row.FTE;
        if (fte === null || fte === undefined || fte === '') continue;
        const n = Number(fte);
        if (Number.isNaN(n) || n < 0.1 || n > 1.0) {
            out.push({Record_ID: row.Worker_ID, Field: 'FTE', Expected: '0.1–1.0', Actual: String(fte), ...ownerMeta(row)});
        }
    }
    return out;
}

async function R006(sources) {
    const out = [];
    for (const row of sources.epp) {
        const cc = row.Cost_Center;
        if (blank(cc)) continue;
        if (!sources.validCC.has(cc)) {
            out.push({Record_ID: row.Worker_ID, Field: 'Cost_Center', Expected: 'in Valid_Cost_Centers', Actual: String(cc), ...ownerMeta(row)});
        }
    }
    return out;
}

async function R007(sources) {
    const out = [];
    for (const row of sources.epp) {
        const cat = asString(row.Category);
        const se = asString(row.Self_Employed);
        if (cat === 'Self-Employed Worker') {
            if (se !== 'Y') {
                out.push({Record_ID: row.Worker_ID, Field: 'Self_Employed', Expected: 'Y', Actual: se, ...ownerMeta(row)});
            }
        } else if (cat) {
            if (se !== 'N') {
                out.push({Record_ID: row.Worker_ID, Field: 'Self_Employed', Expected: 'N', Actual: se, ...ownerMeta(row)});
            }
        }
    }
    return out;
}

async function R008(sources) {
    const out = [];
    for (const row of sources.epp) {
        const code = asString(row.Company_Code);
        const country = asString(row.Roche_Country);
        if (!code || !country) continue;
        if (code.substring(0, 2) !== country.substring(0, 2)) {
            out.push({
                Record_ID: row.Worker_ID,
                Field: 'Company_Code',
                Expected: `starts with ${country.substring(0, 2)}`,
                Actual: code,
                ...ownerMeta(row),
            });
        }
    }
    return out;
}

async function R009(sources) {
    const out = [];
    const groups = new Map();
    for (const row of sources.epp) {
        const fn = asString(row.Legal_First_Name).toLowerCase().trim();
        const ln = asString(row.Legal_Last_Name).toLowerCase().trim();
        const sup = asString(row.Supplier_ID).trim();
        if (!fn || !ln || !sup || !row.Worker_ID) continue;
        const key = `${fn}|${ln}|${sup}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    for (const rows of groups.values()) {
        if (rows.length < 2) continue;
        const ids = rows.map(r => r.Worker_ID);
        for (const row of rows) {
            const others = ids.filter(id => id !== row.Worker_ID);
            out.push({
                Record_ID: row.Worker_ID,
                Field: 'Worker_ID',
                Expected: 'unique per (first, last, supplier)',
                Actual: `duplicates: ${others.join(', ')}`,
                ...ownerMeta(row),
            });
        }
    }
    return out;
}

async function R010(sources) {
    const fgIds = new Set(sources.fg.map(r => r.Worker_ID).filter(Boolean));
    const out = [];
    for (const row of sources.epp) {
        if (!row.Worker_ID) continue;
        if (!fgIds.has(row.Worker_ID)) {
            out.push({Record_ID: row.Worker_ID, Field: 'Worker_ID', Expected: 'present in Fieldglass', Actual: 'missing', ...ownerMeta(row)});
        }
    }
    return out;
}

async function R011(sources) {
    const eppIds = new Set(sources.epp.map(r => r.Worker_ID).filter(Boolean));
    const out = [];
    for (const row of sources.fg) {
        if (!row.Worker_ID) continue;
        if (!eppIds.has(row.Worker_ID)) {
            out.push({
                Record_ID: row.Worker_ID,
                Field: 'Worker_ID',
                Expected: 'present in EPP',
                Actual: 'missing',
                Owner_RRP: '',
                Supplier_ID: row.Supplier_ID || '',
                Roche_Country: '',
            });
        }
    }
    return out;
}

async function R012(sources) {
    const fgByWorker = new Map();
    for (const r of sources.fg) {
        if (r.Worker_ID) fgByWorker.set(r.Worker_ID, r);
    }
    const out = [];
    for (const row of sources.epp) {
        const fg = fgByWorker.get(row.Worker_ID);
        if (!fg) continue;
        const e = asString(row.Category);
        const f = asString(fg.Category);
        if (e !== f) {
            out.push({Record_ID: row.Worker_ID, Field: 'Category', Expected: `FG: ${f}`, Actual: e, ...ownerMeta(row)});
        }
    }
    return out;
}

async function R013(sources) {
    const fgByWorker = new Map();
    for (const r of sources.fg) {
        if (r.Worker_ID) fgByWorker.set(r.Worker_ID, r);
    }
    const out = [];
    for (const row of sources.epp) {
        const fg = fgByWorker.get(row.Worker_ID);
        if (!fg) continue;
        const e = asString(row.Cost_Center);
        const f = asString(fg.Cost_Center);
        if (e !== f) {
            out.push({Record_ID: row.Worker_ID, Field: 'Cost_Center', Expected: `FG: ${f}`, Actual: e, ...ownerMeta(row)});
        }
    }
    return out;
}

async function R014(sources) {
    const fgByWorker = new Map();
    for (const r of sources.fg) {
        if (r.Worker_ID) fgByWorker.set(r.Worker_ID, r);
    }
    const out = [];
    for (const row of sources.epp) {
        const fg = fgByWorker.get(row.Worker_ID);
        if (!fg) continue;
        if (asString(fg.Status) === 'Terminated' && asString(row.Status) === 'Active') {
            out.push({
                Record_ID: row.Worker_ID,
                Field: 'Status',
                Expected: 'not Active (FG=Terminated)',
                Actual: asString(row.Status),
                ...ownerMeta(row),
            });
        }
    }
    return out;
}

async function R015(sources) {
    const poIds = new Set(sources.po.map(r => r.PO_Number).filter(Boolean));
    const out = [];
    for (const row of sources.epp) {
        if (blank(row.PO_Number)) continue;
        if (!poIds.has(row.PO_Number)) {
            out.push({
                Record_ID: row.Worker_ID,
                Field: 'PO_Number',
                Expected: 'present in PurchaseOrders',
                Actual: String(row.PO_Number),
                ...ownerMeta(row),
            });
        }
    }
    return out;
}

async function R016(sources) {
    const poByNum = new Map();
    for (const r of sources.po) {
        if (r.PO_Number) poByNum.set(r.PO_Number, r);
    }
    const out = [];
    for (const row of sources.epp) {
        if (blank(row.PO_Number)) continue;
        const po = poByNum.get(row.PO_Number);
        if (!po) continue;
        if (asString(row.Supplier_ID) !== asString(po.Supplier_ID)) {
            out.push({
                Record_ID: row.Worker_ID,
                Field: 'Supplier_ID',
                Expected: `PO: ${asString(po.Supplier_ID)}`,
                Actual: asString(row.Supplier_ID),
                ...ownerMeta(row),
            });
        }
    }
    return out;
}

async function R017(sources) {
    const out = [];
    for (const row of sources.po) {
        const s = asString(row.PO_Start_Date);
        const e = asString(row.PO_End_Date);
        if (!s || !e) continue;
        if (!(e > s)) {
            out.push({
                Record_ID: row.PO_Number,
                Field: 'PO_End_Date',
                Expected: `> ${s}`,
                Actual: e,
                Owner_RRP: '',
                Supplier_ID: row.Supplier_ID || '',
                Roche_Country: '',
            });
        }
    }
    return out;
}

async function R018(sources) {
    const poIds = new Set(sources.po.map(r => r.PO_Number).filter(Boolean));
    const out = [];
    for (const row of sources.spend) {
        if (blank(row.PO_Number)) continue;
        if (!poIds.has(row.PO_Number)) {
            out.push({
                Record_ID: row.Worker_ID || row._recordId || String(row.PO_Number),
                Field: 'PO_Number',
                Expected: 'present in PurchaseOrders',
                Actual: String(row.PO_Number),
                Owner_RRP: '',
                Supplier_ID: row.Supplier_ID || '',
                Roche_Country: '',
            });
        }
    }
    return out;
}

export const RULES = {
    R001, R002, R003, R004, R005, R006, R007, R008, R009,
    R010, R011, R012, R013, R014, R015, R016, R017, R018,
};
