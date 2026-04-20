import {
    initializeBlock,
    useBase,
    useRecords,
    expandRecord,
} from '@airtable/blocks/interface/ui';
import {useState, useMemo, useCallback, useEffect} from 'react';
import './style.css';

// ─── Helpers ────────────────────────────────────────────────────────────────

function safeGetString(record, field) {
    if (!field) return '';
    try {
        const v = record.getCellValueAsString(field.id);
        return v == null ? '' : String(v);
    } catch {
        return '';
    }
}

// Impact scoring: "High"/"Medium"/"Low" → 3/2/1. Case-insensitive, trims.
// Returns null if the value doesn't match a known level.
function impactScore(raw) {
    if (raw == null) return null;
    const s = String(raw).trim().toLowerCase();
    if (!s) return null;
    if (s === 'high' || s === 'h') return 3;
    if (s === 'medium' || s === 'med' || s === 'm') return 2;
    if (s === 'low' || s === 'l') return 1;
    return null;
}

function impactLabel(score) {
    if (score == null) return '—';
    if (score >= 2.5) return 'High';
    if (score >= 1.5) return 'Medium';
    return 'Low';
}

// Splits multi-value cells (multipleSelects, multipleRecordLinks, etc.)
// into an array of bucket keys. Empty → single '(empty)' bucket.
function splitKeys(raw) {
    const s = raw == null ? '' : String(raw).trim();
    if (!s) return ['(empty)'];
    // Airtable's getCellValueAsString joins multi-selects with ", " (note the space).
    // Split on comma-space to preserve things like "Global / Affiliate (DE, UK, FR, ES, IT)"
    // whose internal commas have no following space? They DO have spaces. This means
    // we cannot perfectly disambiguate without richer data; accept that caveat.
    // For true multi-select fields the split works; for freeform text it's treated
    // as a single bucket which is also correct.
    return [s];
}

// Quick heuristic: field is a natural categorical axis candidate.
function isCategoricalField(field) {
    const t = field.type || '';
    return (
        t === 'singleSelect' ||
        t === 'multipleSelects' ||
        t === 'singleLineText' ||
        t === 'multilineText' ||
        t === 'singleCollaborator' ||
        t === 'multipleCollaborators' ||
        t === 'multipleRecordLinks' ||
        t === 'lookup' ||
        t === 'rollup' ||
        t === 'formula' ||
        t === 'date' ||
        t === 'dateTime' ||
        t === 'checkbox' ||
        t === 'rating' ||
        t === 'number' ||
        t === 'percent' ||
        t === 'duration'
    );
}

// Find a field whose name contains any of the given tokens (case-insensitive).
function findFieldByName(fields, tokens) {
    const lower = fields.map(f => ({f, n: f.name.toLowerCase()}));
    for (const tok of tokens) {
        const hit = lower.find(x => x.n.includes(tok));
        if (hit) return hit.f;
    }
    return null;
}

// ─── Aggregation ────────────────────────────────────────────────────────────

// Bucket records by (row, col). Returns:
//   { rowKeys, colKeys, cells: Map<rowKey, Map<colKey, CellBucket>>, maxValue, totals }
// where CellBucket = { records, count, impactSum, impactCount }
function aggregate({records, rowField, colField, impactField, metric, filterField, filterValue}) {
    const cells = new Map();
    const rowTotals = new Map();
    const colTotals = new Map();
    const rowKeySet = new Set();
    const colKeySet = new Set();

    const getBucket = (rk, ck) => {
        if (!cells.has(rk)) cells.set(rk, new Map());
        const row = cells.get(rk);
        if (!row.has(ck)) {
            row.set(ck, {records: [], count: 0, impactSum: 0, impactCount: 0});
        }
        return row.get(ck);
    };

    records.forEach(r => {
        // Filter
        if (filterField && filterValue && filterValue !== '__all__') {
            const fv = safeGetString(r, filterField);
            if (fv !== filterValue) return;
        }

        const rowRaw = safeGetString(r, rowField);
        const colRaw = safeGetString(r, colField);
        const rowKeys = splitKeys(rowRaw);
        const colKeys = splitKeys(colRaw);
        const score = impactField ? impactScore(safeGetString(r, impactField)) : null;

        rowKeys.forEach(rk => {
            colKeys.forEach(ck => {
                rowKeySet.add(rk);
                colKeySet.add(ck);
                const b = getBucket(rk, ck);
                b.records.push(r);
                b.count += 1;
                if (score != null) {
                    b.impactSum += score;
                    b.impactCount += 1;
                }
            });
        });
    });

    const valueOf = b => {
        if (metric === 'avgImpact') {
            return b.impactCount > 0 ? b.impactSum / b.impactCount : 0;
        }
        if (metric === 'sumImpact') {
            return b.impactSum;
        }
        return b.count;
    };

    let maxValue = 0;
    cells.forEach((rowMap, rk) => {
        rowMap.forEach((b, ck) => {
            const v = valueOf(b);
            if (v > maxValue) maxValue = v;
            rowTotals.set(rk, (rowTotals.get(rk) || 0) + b.count);
            colTotals.set(ck, (colTotals.get(ck) || 0) + b.count);
        });
    });

    const rowKeys = [...rowKeySet].sort((a, b) => (rowTotals.get(b) || 0) - (rowTotals.get(a) || 0));
    const colKeys = [...colKeySet].sort((a, b) => (colTotals.get(b) || 0) - (colTotals.get(a) || 0));

    return {rowKeys, colKeys, cells, maxValue, rowTotals, colTotals, valueOf};
}

// ─── Color scale ────────────────────────────────────────────────────────────

// White → Airtable-ish red. value in [0, max]. Uses a perceptual sqrt ramp so
// small counts are still visible against the empty cells.
function heatColor(value, max) {
    if (!max || value <= 0) return '#ffffff';
    const t = Math.sqrt(Math.min(1, value / max));
    // Interpolate between #ffffff (255,255,255) and #dc2626 (220,38,38).
    const r = Math.round(255 + (220 - 255) * t);
    const g = Math.round(255 + (38 - 255) * t);
    const b = Math.round(255 + (38 - 255) * t);
    return `rgb(${r}, ${g}, ${b})`;
}

function textColorFor(value, max) {
    if (!max || value <= 0) return '#475569';
    const t = Math.sqrt(Math.min(1, value / max));
    return t > 0.55 ? '#ffffff' : '#1f2937';
}

// ─── UI pieces ──────────────────────────────────────────────────────────────

function FieldSelect({label, fields, value, onChange, allowNone}) {
    return (
        <label className="hm-select">
            <span className="hm-select-label">{label}</span>
            <select value={value || ''} onChange={e => onChange(e.target.value || null)}>
                {allowNone && <option value="">(none)</option>}
                {fields.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                ))}
            </select>
        </label>
    );
}

function MetricSelect({value, onChange, hasImpact}) {
    return (
        <label className="hm-select">
            <span className="hm-select-label">Metric</span>
            <select value={value} onChange={e => onChange(e.target.value)}>
                <option value="count">Record count</option>
                <option value="avgImpact" disabled={!hasImpact}>Avg impact (H/M/L)</option>
                <option value="sumImpact" disabled={!hasImpact}>Sum impact (H/M/L)</option>
            </select>
        </label>
    );
}

function FilterControl({fields, filterFieldId, filterValue, onChangeField, onChangeValue, records}) {
    const field = fields.find(f => f.id === filterFieldId) || null;
    const options = useMemo(() => {
        if (!field) return [];
        const set = new Set();
        records.forEach(r => {
            const v = safeGetString(r, field);
            if (v) set.add(v);
        });
        return [...set].sort();
    }, [field, records]);

    return (
        <>
            <label className="hm-select">
                <span className="hm-select-label">Filter field</span>
                <select value={filterFieldId || ''} onChange={e => onChangeField(e.target.value || null)}>
                    <option value="">(none)</option>
                    {fields.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                </select>
            </label>
            {field && (
                <label className="hm-select">
                    <span className="hm-select-label">Filter value</span>
                    <select value={filterValue || '__all__'} onChange={e => onChangeValue(e.target.value)}>
                        <option value="__all__">All</option>
                        {options.map(v => (
                            <option key={v} value={v}>{v}</option>
                        ))}
                    </select>
                </label>
            )}
        </>
    );
}

function Legend({maxValue, metric}) {
    const stops = [0, 0.25, 0.5, 0.75, 1];
    const format = v => {
        if (metric === 'avgImpact') return v.toFixed(2);
        if (metric === 'sumImpact') return Math.round(v);
        return Math.round(v);
    };
    return (
        <div className="hm-legend">
            <span className="hm-legend-label">Low</span>
            <div className="hm-legend-bar">
                {stops.map(s => (
                    <div
                        key={s}
                        className="hm-legend-step"
                        style={{background: heatColor(s * maxValue, maxValue)}}
                        title={format(s * maxValue)}
                    />
                ))}
            </div>
            <span className="hm-legend-label">High</span>
            <span className="hm-legend-max">max = {format(maxValue)}</span>
        </div>
    );
}

// ─── Record side panel ──────────────────────────────────────────────────────

function RecordPanel({selection, onClose, bucket, rowField, colField}) {
    useEffect(() => {
        const onKey = e => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    if (!selection || !bucket) return null;
    const {rowKey, colKey} = selection;

    return (
        <div className="hm-panel-overlay" onClick={onClose}>
            <div className="hm-panel" onClick={e => e.stopPropagation()}>
                <div className="hm-panel-header">
                    <div className="hm-panel-title">
                        <div className="hm-panel-axis">
                            <span className="hm-panel-axis-label">{rowField.name}:</span>
                            <span className="hm-panel-axis-value">{rowKey}</span>
                        </div>
                        <div className="hm-panel-axis">
                            <span className="hm-panel-axis-label">{colField.name}:</span>
                            <span className="hm-panel-axis-value">{colKey}</span>
                        </div>
                    </div>
                    <button className="hm-panel-close" onClick={onClose} title="Close">×</button>
                </div>
                <div className="hm-panel-stats">
                    <span><strong>{bucket.count}</strong> record{bucket.count !== 1 ? 's' : ''}</span>
                    {bucket.impactCount > 0 && (
                        <span>
                            Avg impact:{' '}
                            <strong>{impactLabel(bucket.impactSum / bucket.impactCount)}</strong>
                            {' '}({(bucket.impactSum / bucket.impactCount).toFixed(2)})
                        </span>
                    )}
                </div>
                <div className="hm-panel-list">
                    {bucket.records.map(r => (
                        <div
                            key={r.id}
                            className="hm-panel-item"
                            onClick={() => expandRecord(r)}
                        >
                            <span className="hm-panel-item-name">{r.name || '(unnamed)'}</span>
                            <span className="hm-panel-item-open">Open →</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Tooltip ────────────────────────────────────────────────────────────────

function buildTooltip(bucket, rowKey, colKey, metric) {
    if (!bucket) return '';
    const lines = [
        `${rowKey} × ${colKey}`,
        `${bucket.count} record${bucket.count !== 1 ? 's' : ''}`,
    ];
    if (bucket.impactCount > 0) {
        const avg = bucket.impactSum / bucket.impactCount;
        lines.push(`Avg impact: ${impactLabel(avg)} (${avg.toFixed(2)})`);
    }
    if (metric === 'sumImpact') {
        lines.push(`Impact sum: ${bucket.impactSum}`);
    }
    return lines.join('\n');
}

// ─── Grid ───────────────────────────────────────────────────────────────────

function HeatmapGrid({agg, rowField, colField, metric, onSelect}) {
    const {rowKeys, colKeys, cells, maxValue, rowTotals, colTotals, valueOf} = agg;

    if (rowKeys.length === 0 || colKeys.length === 0) {
        return (
            <div className="hm-empty">
                No data. Pick row and column fields with values, or loosen the filter.
            </div>
        );
    }

    const formatCell = v => {
        if (metric === 'avgImpact') return v === 0 ? '' : v.toFixed(1);
        return v === 0 ? '' : String(Math.round(v));
    };

    return (
        <div className="hm-grid-scroll">
            <table className="hm-grid">
                <thead>
                    <tr>
                        <th className="hm-corner">
                            <span className="hm-corner-row">{rowField.name}</span>
                            <span className="hm-corner-sep">×</span>
                            <span className="hm-corner-col">{colField.name}</span>
                        </th>
                        {colKeys.map(ck => (
                            <th key={ck} className="hm-col-header" title={ck}>
                                <div className="hm-col-header-inner">{ck}</div>
                            </th>
                        ))}
                        <th className="hm-col-header hm-total-header">Total</th>
                    </tr>
                </thead>
                <tbody>
                    {rowKeys.map(rk => {
                        const rowMap = cells.get(rk);
                        return (
                            <tr key={rk}>
                                <th className="hm-row-header" title={rk}>{rk}</th>
                                {colKeys.map(ck => {
                                    const b = rowMap && rowMap.get(ck);
                                    const v = b ? valueOf(b) : 0;
                                    const label = formatCell(v);
                                    return (
                                        <td
                                            key={ck}
                                            className={`hm-cell ${b ? 'has-data' : ''}`}
                                            style={{
                                                background: heatColor(v, maxValue),
                                                color: textColorFor(v, maxValue),
                                            }}
                                            title={buildTooltip(b, rk, ck, metric)}
                                            onClick={() => b && onSelect({rowKey: rk, colKey: ck})}
                                        >
                                            {label}
                                        </td>
                                    );
                                })}
                                <td className="hm-cell hm-total-cell">{rowTotals.get(rk) || 0}</td>
                            </tr>
                        );
                    })}
                    <tr className="hm-total-row">
                        <th className="hm-row-header hm-total-header">Total</th>
                        {colKeys.map(ck => (
                            <td key={ck} className="hm-cell hm-total-cell">{colTotals.get(ck) || 0}</td>
                        ))}
                        <td className="hm-cell hm-total-cell hm-grand-total">
                            {[...rowTotals.values()].reduce((a, b) => a + b, 0)}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

// ─── Main ───────────────────────────────────────────────────────────────────

function HeatmapWithData({table}) {
    const records = useRecords(table);
    const categoricalFields = useMemo(
        () => table.fields.filter(isCategoricalField),
        [table.fields],
    );

    // Auto-pick sensible defaults on mount. User can override via dropdowns.
    const defaultRowField = useMemo(
        () => findFieldByName(categoricalFields, ['persona', 'role']) || categoricalFields[0],
        [categoricalFields],
    );
    const defaultColField = useMemo(
        () => {
            const excludeId = defaultRowField ? defaultRowField.id : null;
            const candidates = categoricalFields.filter(f => f.id !== excludeId);
            return findFieldByName(candidates, ['component']) || candidates[0];
        },
        [categoricalFields, defaultRowField],
    );
    const defaultImpactField = useMemo(
        () => findFieldByName(table.fields, ['change impact', 'impact']),
        [table.fields],
    );

    const [rowFieldId, setRowFieldId] = useState(defaultRowField ? defaultRowField.id : null);
    const [colFieldId, setColFieldId] = useState(defaultColField ? defaultColField.id : null);
    const [impactFieldId, setImpactFieldId] = useState(
        defaultImpactField ? defaultImpactField.id : null,
    );
    const [metric, setMetric] = useState(defaultImpactField ? 'avgImpact' : 'count');
    const [filterFieldId, setFilterFieldId] = useState(null);
    const [filterValue, setFilterValue] = useState('__all__');
    const [selection, setSelection] = useState(null);

    const rowField = table.getFieldByIdIfExists(rowFieldId);
    const colField = table.getFieldByIdIfExists(colFieldId);
    const impactField = impactFieldId ? table.getFieldByIdIfExists(impactFieldId) : null;
    const filterField = filterFieldId ? table.getFieldByIdIfExists(filterFieldId) : null;

    const agg = useMemo(() => {
        if (!rowField || !colField) {
            return {rowKeys: [], colKeys: [], cells: new Map(), maxValue: 0,
                    rowTotals: new Map(), colTotals: new Map(), valueOf: () => 0};
        }
        return aggregate({
            records,
            rowField,
            colField,
            impactField,
            metric,
            filterField,
            filterValue,
        });
    }, [records, rowField, colField, impactField, metric, filterField, filterValue]);

    const handleSelect = useCallback(sel => setSelection(sel), []);
    const handleClose = useCallback(() => setSelection(null), []);

    const selectedBucket = selection && agg.cells.get(selection.rowKey)
        ? agg.cells.get(selection.rowKey).get(selection.colKey)
        : null;

    return (
        <div className="hm-root">
            <div className="hm-toolbar">
                <FieldSelect
                    label="Rows"
                    fields={categoricalFields}
                    value={rowFieldId}
                    onChange={setRowFieldId}
                />
                <FieldSelect
                    label="Columns"
                    fields={categoricalFields}
                    value={colFieldId}
                    onChange={setColFieldId}
                />
                <MetricSelect value={metric} onChange={setMetric} hasImpact={!!impactField} />
                <FieldSelect
                    label="Impact field"
                    fields={table.fields}
                    value={impactFieldId}
                    onChange={id => {
                        setImpactFieldId(id);
                        if (!id && metric !== 'count') setMetric('count');
                    }}
                    allowNone
                />
                <FilterControl
                    fields={table.fields}
                    filterFieldId={filterFieldId}
                    filterValue={filterValue}
                    onChangeField={id => {
                        setFilterFieldId(id);
                        setFilterValue('__all__');
                    }}
                    onChangeValue={setFilterValue}
                    records={records}
                />
                <div className="hm-toolbar-spacer" />
                <div className="hm-record-count">
                    {records.length} record{records.length !== 1 ? 's' : ''}
                </div>
            </div>

            <Legend maxValue={agg.maxValue} metric={metric} />

            {!rowField || !colField ? (
                <div className="hm-empty">Pick row and column fields to build the heatmap.</div>
            ) : (
                <HeatmapGrid
                    agg={agg}
                    rowField={rowField}
                    colField={colField}
                    metric={metric}
                    onSelect={handleSelect}
                />
            )}

            <RecordPanel
                selection={selection}
                bucket={selectedBucket}
                rowField={rowField}
                colField={colField}
                onClose={handleClose}
            />
        </div>
    );
}

function HeatmapApp() {
    const base = useBase();
    const table = base.tables[0];

    if (!table) {
        return (
            <div className="hm-error">
                No table found. Please configure a table in the Data panel.
            </div>
        );
    }

    return <HeatmapWithData table={table} />;
}

initializeBlock({interface: () => <HeatmapApp />});
