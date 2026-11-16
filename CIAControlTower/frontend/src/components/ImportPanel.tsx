import {useBase} from '@airtable/blocks/interface/ui';
import {useMemo, useState} from 'react';
import {tokens} from '../styles/tokens';
import {FIELDS} from '../utils/schema';

const RADIUS = {card: 16, inner: 12, pill: 980};
const SHADOW = {
    card: '0 1px 2px rgba(2,35,102,0.04), 0 8px 24px -12px rgba(2,35,102,0.16)',
    raised: '0 1px 2px rgba(2,35,102,0.06), 0 1px 1px rgba(2,35,102,0.04)',
};

const BATCH = 50;

/** Field types this importer can write. Everything else (collaborators,
 *  links, lookups, formulas, computed) is left for Airtable to fill or set
 *  manually. */
const SUPPORTED_TYPES = new Set([
    'singleLineText', 'multilineText', 'richText', 'email', 'url', 'phoneNumber', 'barcode',
    'number', 'percent', 'currency', 'duration', 'rating',
    'singleSelect', 'multipleSelects', 'checkbox', 'date', 'dateTime',
]);

interface LiveField {
    id: string;
    name: string;
    type: string;
    isComputed: boolean;
}
interface LiveTable {
    fields: ReadonlyArray<LiveField>;
    hasPermissionToCreateRecords(records?: ReadonlyArray<{fields: Record<string, unknown>}>): boolean;
    createRecordsAsync(records: ReadonlyArray<{fields: Record<string, unknown>}>): Promise<string[]>;
}

type Mode = 'paste' | 'file';
type Phase = 'edit' | 'importing' | 'done' | 'error';

interface Parsed {
    headers: string[];
    rows: string[][];
}

/** Robust CSV/TSV parser. Auto-detects tab vs comma from the first line and
 *  handles quoted fields with embedded delimiters and newlines, and also
 *  markdown pipe tables (what the critique prompt outputs). */
function parseDelimited(text: string): Parsed {
    const firstLine = (text.split(/\r?\n/).find(l => l.trim() !== '') ?? '').trim();
    const looksMarkdown = firstLine.startsWith('|') || /\|\s*:?-{3,}/.test(text);
    if (looksMarkdown) return parseMarkdownTable(text);

    const nl = text.indexOf('\n');
    const headLine = nl === -1 ? text : text.slice(0, nl);
    const delim = headLine.includes('\t') ? '\t' : ',';
    const rows: string[][] = [];
    let field = '';
    let row: string[] = [];
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += c;
            }
        } else if (c === '"') {
            inQuotes = true;
        } else if (c === delim) {
            row.push(field);
            field = '';
        } else if (c === '\n') {
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else if (c !== '\r') {
            field += c;
        }
    }
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    const headers = (rows.shift() ?? []).map(h => h.trim());
    const data = rows.filter(r => r.some(c => c.trim() !== ''));
    return {headers, rows: data};
}

/** Parse a markdown pipe table: strips outer pipes, skips the `---` separator
 *  row and any non-table footer lines (e.g. "Total rows generated: 41"). */
function parseMarkdownTable(text: string): Parsed {
    const rows: string[][] = [];
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line.includes('|')) continue; // footer / prose lines
        let cells = line.split('|');
        if (cells.length && cells[0]!.trim() === '') cells = cells.slice(1);
        if (cells.length && cells[cells.length - 1]!.trim() === '') cells = cells.slice(0, -1);
        const trimmed = cells.map(c => c.trim().replace(/\\(["|])/g, '$1'));
        // Skip the header/body separator row (all cells are --- / :--: / empty).
        if (trimmed.every(c => c === '' || /^:?-{2,}:?$/.test(c))) continue;
        rows.push(trimmed);
    }
    const headers = rows.shift() ?? [];
    const data = rows.filter(r => r.some(c => c !== ''));
    return {headers, rows: data};
}

const normalize = (s: string): string => s.toLowerCase().replace(/[\s_\-()]+/g, '');

function coerce(type: string, raw: string): unknown | undefined {
    const v = raw.trim();
    if (v === '') return undefined;
    switch (type) {
        case 'number':
        case 'percent':
        case 'currency':
        case 'duration':
        case 'rating': {
            const n = Number(v.replace(/[^0-9.-]/g, ''));
            return Number.isFinite(n) ? n : undefined;
        }
        case 'singleSelect':
            return {name: v};
        case 'multipleSelects':
            return v.split(/[,;]/).map(s => s.trim()).filter(Boolean).map(name => ({name}));
        case 'checkbox':
            return /^(true|yes|y|1|x|checked|done)$/i.test(v);
        default:
            return v;
    }
}

export function ImportPanel({tableName, onImported, reviewUrl}: {tableName: string; onImported?: () => void; reviewUrl?: string}) {
    const base = useBase() as unknown as {getTableByNameIfExists(name: string): LiveTable | null};
    const table = base.getTableByNameIfExists(tableName);

    const [mode, setMode] = useState<Mode>('paste');
    const [raw, setRaw] = useState('');
    const [fileName, setFileName] = useState('');
    const [phase, setPhase] = useState<Phase>('edit');
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState<{created: number; message?: string} | null>(null);

    const parsed = useMemo(() => (raw.trim() ? parseDelimited(raw) : null), [raw]);

    // Map each header to a writable, supported field.
    const mapping = useMemo(() => {
        if (!table || !parsed) return null;
        const writable = table.fields.filter(f => !f.isComputed && SUPPORTED_TYPES.has(f.type));
        const byNorm = new Map<string, LiveField>();
        for (const f of writable) byNorm.set(normalize(f.name), f);
        const matched: {header: string; field: LiveField}[] = [];
        const ignored: string[] = [];
        parsed.headers.forEach(h => {
            const f = byNorm.get(normalize(h));
            if (f) matched.push({header: h, field: f});
            else if (h.trim()) ignored.push(h);
        });
        return {matched, ignored};
    }, [table, parsed]);

    const validationField = useMemo(
        () => table?.fields.find(f => f.name === FIELDS.validationStatus) ?? null,
        [table],
    );

    const canCreate = table ? table.hasPermissionToCreateRecords() : false;
    const rowCount = parsed?.rows.length ?? 0;
    const matchedCount = mapping?.matched.length ?? 0;

    const buildRecords = (): ReadonlyArray<{fields: Record<string, unknown>}> => {
        if (!parsed || !mapping) return [];
        const headerIndex = new Map<string, number>();
        parsed.headers.forEach((h, i) => headerIndex.set(h, i));
        return parsed.rows.map(cells => {
            const fields: Record<string, unknown> = {};
            for (const {header, field} of mapping.matched) {
                const idx = headerIndex.get(header);
                if (idx === undefined) continue;
                const val = coerce(field.type, cells[idx] ?? '');
                if (val !== undefined) fields[field.name] = val;
            }
            // Default Validation Status to Pending when not supplied.
            if (validationField && fields[validationField.name] === undefined) {
                fields[validationField.name] = {name: 'Pending'};
            }
            return {fields};
        });
    };

    const runImport = async () => {
        if (!table) return;
        const records = buildRecords();
        if (records.length === 0) return;
        setPhase('importing');
        setProgress(0);
        let created = 0;
        try {
            for (let i = 0; i < records.length; i += BATCH) {
                const chunk = records.slice(i, i + BATCH);
                await table.createRecordsAsync(chunk);
                created += chunk.length;
                setProgress(created);
            }
            setResult({created});
            setPhase('done');
            onImported?.();
        } catch (e) {
            setResult({created, message: e instanceof Error ? e.message : 'Import failed.'});
            setPhase('error');
        }
    };

    const onFile = (file: File | undefined) => {
        if (!file) return;
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = () => setRaw(typeof reader.result === 'string' ? reader.result : '');
        reader.readAsText(file);
    };

    const reset = () => {
        setRaw('');
        setFileName('');
        setProgress(0);
        setResult(null);
        setPhase('edit');
    };

    return (
        <div style={card}>
            <div style={{padding: tokens.space.xxl, display: 'flex', flexDirection: 'column', gap: tokens.space.lg}}>
                <div style={{display: 'flex', flexDirection: 'column', gap: 2}}>
                    <span style={eyebrow}>Import</span>
                    <h2 style={{margin: 0, fontFamily: tokens.fonts.serif, fontSize: 20, fontWeight: 600, letterSpacing: '-0.015em', color: tokens.colors.text}}>
                        Add data
                    </h2>
                </div>

                <div style={{display: 'flex', flexDirection: 'column', gap: tokens.space.lg}}>
                    {!table ? (
                        <Banner tone="warn">The Impacts table could not be found, so importing is unavailable.</Banner>
                    ) : !canCreate ? (
                        <Banner tone="warn">You do not have permission to create records in this table. Ask your admin to grant edit access.</Banner>
                    ) : phase === 'done' ? (
                        <>
                            <Banner tone="good">
                                Imported <strong>{result?.created ?? 0}</strong> record{(result?.created ?? 0) === 1 ? '' : 's'} as
                                Pending. Go to <strong>Review Data</strong> to validate each one and set its Validation Status to
                                Reviewed — that publishes it to the dashboard.
                            </Banner>
                            <div style={{display: 'flex', gap: tokens.space.sm}}>
                                <button type="button" onClick={reset} style={secondaryBtn}>Import more</button>
                                {reviewUrl ? (
                                    <a href={reviewUrl} target="_top" rel="noopener" style={{...primaryBtn, display: 'inline-flex', alignItems: 'center', textDecoration: 'none'}}>
                                        Open the Review grid ›
                                    </a>
                                ) : null}
                            </div>
                        </>
                    ) : (
                        <>
                            <p style={{margin: 0, fontSize: 13, color: tokens.colors.textMuted, lineHeight: 1.6}}>
                                Paste the table produced by the critique prompt straight in — the Markdown table (with pipes) works
                                as-is, no Google Sheet needed. CSV and tab-separated paste also work, as does a CSV file. The first row
                                must be the column headers; they are matched to the table fields by name, the “Total rows generated”
                                footer line is ignored, and every row is added with its Validation Status set to <strong>Pending</strong>.
                            </p>

                            <Segmented mode={mode} onChange={setMode} />

                            {mode === 'paste' ? (
                                <textarea
                                    value={raw}
                                    onChange={e => setRaw(e.target.value)}
                                    placeholder={'Paste here — headers in the first row.\nCopy straight from Google Sheets (tab-separated) or paste CSV.'}
                                    spellCheck={false}
                                    style={textarea}
                                />
                            ) : (
                                <label style={fileDrop}>
                                    <input
                                        type="file"
                                        accept=".csv,.tsv,.txt"
                                        onChange={e => onFile(e.target.files?.[0])}
                                        style={{display: 'none'}}
                                    />
                                    <span style={{fontFamily: tokens.fonts.serif, fontSize: 15, fontWeight: 600, color: tokens.colors.text}}>
                                        {fileName || 'Choose a CSV file'}
                                    </span>
                                    <span style={{fontSize: 12, color: tokens.colors.textMuted}}>
                                        {fileName ? 'Click to choose a different file' : 'CSV or TSV, headers in the first row'}
                                    </span>
                                </label>
                            )}

                            {parsed ? (
                                <div style={previewCard}>
                                    <Row label="Rows to import" value={String(rowCount)} />
                                    <Row label="Columns matched" value={`${matchedCount} of ${parsed.headers.length}`} />
                                    {mapping && mapping.ignored.length > 0 ? (
                                        <Row label="Ignored columns" value={mapping.ignored.join(', ')} muted />
                                    ) : null}
                                </div>
                            ) : null}

                            {phase === 'error' ? (
                                <Banner tone="warn">
                                    {result?.created ? <>Imported {result.created} before stopping. </> : null}
                                    {result?.message}
                                </Banner>
                            ) : null}

                            {phase === 'importing' ? (
                                <Banner tone="info">Importing… {progress} of {rowCount}</Banner>
                            ) : null}

                            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: tokens.space.sm}}>
                                {raw ? <button type="button" onClick={reset} style={secondaryBtn} disabled={phase === 'importing'}>Clear</button> : null}
                                <button
                                    type="button"
                                    onClick={runImport}
                                    disabled={phase === 'importing' || rowCount === 0 || matchedCount === 0}
                                    style={{...primaryBtn, opacity: phase === 'importing' || rowCount === 0 || matchedCount === 0 ? 0.5 : 1, cursor: phase === 'importing' || rowCount === 0 || matchedCount === 0 ? 'default' : 'pointer'}}
                                >
                                    {phase === 'importing' ? 'Importing…' : `Import ${rowCount || ''} row${rowCount === 1 ? '' : 's'}`.trim()}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function Segmented({mode, onChange}: {mode: Mode; onChange: (m: Mode) => void}) {
    const opts: {key: Mode; label: string}[] = [
        {key: 'paste', label: 'Paste rows'},
        {key: 'file', label: 'CSV file'},
    ];
    return (
        <div style={{display: 'flex', gap: 4, padding: 4, background: tokens.colors.bgAlt, borderRadius: RADIUS.inner}}>
            {opts.map(o => {
                const on = o.key === mode;
                return (
                    <button
                        key={o.key}
                        type="button"
                        onClick={() => onChange(o.key)}
                        style={{
                            flex: 1,
                            padding: '8px 12px',
                            borderRadius: RADIUS.inner - 4,
                            border: 'none',
                            background: on ? tokens.colors.bgPanel : 'transparent',
                            boxShadow: on ? SHADOW.raised : 'none',
                            color: on ? tokens.colors.text : tokens.colors.textMuted,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

function Row({label, value, muted}: {label: string; value: string; muted?: boolean}) {
    return (
        <div style={{display: 'flex', justifyContent: 'space-between', gap: tokens.space.md, padding: '6px 0'}}>
            <span style={{fontSize: 12, color: tokens.colors.textMuted}}>{label}</span>
            <span style={{fontSize: 12.5, fontWeight: 600, color: muted ? tokens.colors.textFaint : tokens.colors.text, textAlign: 'right', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis'}}>
                {value}
            </span>
        </div>
    );
}

function Banner({tone, children}: {tone: 'info' | 'warn' | 'good'; children: React.ReactNode}) {
    const bg = {info: tokens.colors.ruleSoft, warn: '#FFFBF2', good: '#E7F8EF'}[tone];
    const dot = {info: tokens.colors.accent, warn: '#E8A317', good: tokens.colors.sevLow}[tone];
    return (
        <div style={{display: 'flex', gap: tokens.space.sm, padding: `${tokens.space.md} ${tokens.space.lg}`, background: bg, borderRadius: RADIUS.inner}}>
            <span aria-hidden style={{width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0, marginTop: 6}} />
            <span style={{fontSize: 13, color: tokens.colors.text, lineHeight: 1.6}}>{children}</span>
        </div>
    );
}

const card: React.CSSProperties = {
    background: tokens.colors.bgPanel,
    borderRadius: RADIUS.card,
    boxShadow: SHADOW.card,
    maxWidth: 820,
    margin: '0 auto',
    width: '100%',
};
const eyebrow: React.CSSProperties = {
    fontSize: 10,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: tokens.colors.textFaint,
    fontWeight: 700,
};
const textarea: React.CSSProperties = {
    width: '100%',
    minHeight: 200,
    resize: 'vertical',
    padding: tokens.space.md,
    borderRadius: RADIUS.inner,
    border: `1px solid ${tokens.colors.rule}`,
    background: tokens.colors.bgPanel,
    fontFamily: tokens.fonts.mono,
    fontSize: 12,
    lineHeight: 1.5,
    color: tokens.colors.text,
    outline: 'none',
};
const fileDrop: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 150,
    padding: tokens.space.xl,
    borderRadius: RADIUS.inner,
    background: tokens.colors.bgAlt,
    border: `1.5px dashed ${tokens.colors.rule}`,
    cursor: 'pointer',
    textAlign: 'center',
};
const previewCard: React.CSSProperties = {
    padding: `4px ${tokens.space.lg}`,
    background: tokens.colors.bgAlt,
    borderRadius: RADIUS.card,
};
const primaryBtn: React.CSSProperties = {
    padding: '9px 18px',
    borderRadius: RADIUS.pill,
    border: 'none',
    background: tokens.colors.accent,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.02em',
    cursor: 'pointer',
};
const secondaryBtn: React.CSSProperties = {
    padding: '9px 16px',
    borderRadius: RADIUS.pill,
    border: 'none',
    background: tokens.colors.bgAlt,
    color: tokens.colors.text,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
};
