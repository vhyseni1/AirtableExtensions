import {useCallback, useRef, useState} from 'react';
import {tokens} from '../../styles/tokens';
import {Panel} from '../primitives/Panel';

type Phase = 'idle' | 'uploading' | 'success';

interface StagedFile {
    name: string;
    size: number;
    rows: number;
}

const ACCEPT = '.csv,.tsv,.xlsx,.xls,.json';

function fmtSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Data-intake page. Purely a front-end mock: staged files and the "ingest"
 * action never touch Airtable or any backend — it simulates a short upload
 * and reports success. Nothing is persisted.
 */
export function AddDataView() {
    const [target, setTarget] = useState('Impacts');
    const [dragging, setDragging] = useState(false);
    const [files, setFiles] = useState<StagedFile[]>([]);
    const [phase, setPhase] = useState<Phase>('idle');
    const [ingestedRows, setIngestedRows] = useState(0);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const stage = useCallback((list: FileList | null) => {
        if (!list || list.length === 0) return;
        const staged: StagedFile[] = Array.from(list).map(f => ({
            name: f.name,
            size: f.size,
            // Cosmetic row estimate — we never actually parse the file.
            rows: Math.max(1, Math.round(f.size / 180)),
        }));
        setFiles(prev => [...prev, ...staged]);
        setPhase('idle');
    }, []);

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setDragging(false);
            stage(e.dataTransfer.files);
        },
        [stage],
    );

    const removeFile = useCallback((idx: number) => {
        setFiles(prev => prev.filter((_, i) => i !== idx));
        setPhase('idle');
    }, []);

    const reset = useCallback(() => {
        setFiles([]);
        setPhase('idle');
        setIngestedRows(0);
        if (inputRef.current) inputRef.current.value = '';
    }, []);

    const ingest = useCallback(() => {
        if (files.length === 0) return;
        const total = files.reduce((sum, f) => sum + f.rows, 0);
        setIngestedRows(total);
        setPhase('uploading');
        // Fake processing delay — no data actually leaves the browser.
        window.setTimeout(() => setPhase('success'), 1100);
    }, [files]);

    const totalRows = files.reduce((sum, f) => sum + f.rows, 0);

    return (
        <div style={{display: 'flex', flexDirection: 'column', gap: tokens.space.md}}>
            <Panel
                eyebrow="Intake"
                title="Add data"
                subtitle="Drop a new review export to feed the control tower — CSV, Excel, or JSON"
                actions={
                    <select
                        value={target}
                        onChange={e => setTarget(e.target.value)}
                        style={selectStyle}
                        title="Target table"
                    >
                        <option value="Impacts">Impacts</option>
                        <option value="Change_Components">Change_Components</option>
                        <option value="Roles">Roles</option>
                    </select>
                }
            >
                <div
                    onDragOver={e => {
                        e.preventDefault();
                        setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    onClick={() => inputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
                    }}
                    style={{
                        border: `2px dashed ${dragging ? tokens.colors.accent : tokens.colors.rule}`,
                        borderRadius: tokens.radius.lg,
                        background: dragging ? tokens.colors.accentTint : tokens.colors.bgAlt,
                        padding: `${tokens.space.xxl} ${tokens.space.xl}`,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: tokens.space.sm,
                        cursor: 'pointer',
                        textAlign: 'center',
                        transition: 'border-color 120ms ease, background 120ms ease',
                    }}
                >
                    <div
                        aria-hidden
                        style={{
                            width: 46,
                            height: 46,
                            borderRadius: '50%',
                            background: tokens.colors.bgPanel,
                            border: `1px solid ${tokens.colors.rule}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 20,
                            color: tokens.colors.accent,
                            boxShadow: tokens.shadow.panel,
                        }}
                    >
                        ⬆
                    </div>
                    <div
                        style={{
                            fontFamily: tokens.fonts.serif,
                            fontSize: 15,
                            fontWeight: 600,
                            color: tokens.colors.text,
                        }}
                    >
                        {dragging ? 'Drop to stage files' : 'Drag & drop files here'}
                    </div>
                    <div style={{fontSize: 12, color: tokens.colors.textMuted}}>
                        or <span style={{color: tokens.colors.accent, fontWeight: 600}}>browse</span> — CSV, TSV,
                        Excel, or JSON
                    </div>
                    <input
                        ref={inputRef}
                        type="file"
                        accept={ACCEPT}
                        multiple
                        onChange={e => stage(e.target.files)}
                        style={{display: 'none'}}
                    />
                </div>

                {files.length > 0 ? (
                    <div style={{marginTop: tokens.space.md, display: 'flex', flexDirection: 'column', gap: tokens.space.xs}}>
                        {files.map((f, i) => (
                            <div
                                key={`${f.name}-${i}`}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: tokens.space.sm,
                                    padding: `${tokens.space.sm} ${tokens.space.md}`,
                                    background: tokens.colors.bgPanel,
                                    border: `1px solid ${tokens.colors.rule}`,
                                    borderRadius: tokens.radius.md,
                                }}
                            >
                                <span aria-hidden style={{fontSize: 15, color: tokens.colors.accent}}>▤</span>
                                <span style={{fontSize: 13, fontWeight: 600, color: tokens.colors.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                    {f.name}
                                </span>
                                <span style={{fontSize: 11, color: tokens.colors.textFaint, fontFamily: tokens.fonts.mono}}>
                                    ~{f.rows.toLocaleString()} rows · {fmtSize(f.size)}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => removeFile(i)}
                                    title="Remove"
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: tokens.colors.textFaint,
                                        cursor: 'pointer',
                                        fontSize: 15,
                                        lineHeight: 1,
                                        padding: 2,
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                ) : null}

                {phase === 'success' ? (
                    <div
                        role="status"
                        style={{
                            marginTop: tokens.space.md,
                            display: 'flex',
                            alignItems: 'center',
                            gap: tokens.space.sm,
                            padding: `${tokens.space.md}`,
                            background: '#E7F8EF',
                            border: `1px solid ${tokens.colors.sevLow}`,
                            borderRadius: tokens.radius.md,
                        }}
                    >
                        <span
                            aria-hidden
                            style={{
                                width: 24,
                                height: 24,
                                borderRadius: '50%',
                                background: tokens.colors.sevLow,
                                color: '#FFFFFF',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 14,
                                flexShrink: 0,
                            }}
                        >
                            ✓
                        </span>
                        <div style={{flex: 1, minWidth: 0}}>
                            <div style={{fontSize: 13, fontWeight: 700, color: '#046B38'}}>
                                Successfully ingested {ingestedRows.toLocaleString()} records into {target}
                            </div>
                            <div style={{fontSize: 11, color: '#2E7D52'}}>
                                {files.length} file{files.length === 1 ? '' : 's'} processed · validation queued
                            </div>
                        </div>
                        <button type="button" onClick={reset} style={secondaryBtn}>
                            Add more
                        </button>
                    </div>
                ) : (
                    <div
                        style={{
                            marginTop: tokens.space.md,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: tokens.space.md,
                            flexWrap: 'wrap',
                        }}
                    >
                        <span style={{fontSize: 12, color: tokens.colors.textMuted}}>
                            {files.length === 0
                                ? 'No files staged yet.'
                                : `${files.length} file${files.length === 1 ? '' : 's'} staged · ~${totalRows.toLocaleString()} rows ready for ${target}`}
                        </span>
                        <div style={{display: 'flex', gap: tokens.space.sm}}>
                            {files.length > 0 ? (
                                <button type="button" onClick={reset} style={secondaryBtn} disabled={phase === 'uploading'}>
                                    Clear
                                </button>
                            ) : null}
                            <button
                                type="button"
                                onClick={ingest}
                                disabled={files.length === 0 || phase === 'uploading'}
                                style={{
                                    ...primaryBtn,
                                    opacity: files.length === 0 || phase === 'uploading' ? 0.5 : 1,
                                    cursor: files.length === 0 || phase === 'uploading' ? 'default' : 'pointer',
                                }}
                            >
                                {phase === 'uploading' ? 'Ingesting…' : 'Ingest data →'}
                            </button>
                        </div>
                    </div>
                )}
            </Panel>

            <Panel eyebrow="Demo" title="How intake works" subtitle="What happens when you drop a file">
                <ol style={{margin: 0, paddingLeft: 18, color: tokens.colors.textMuted, fontSize: 13, lineHeight: 1.7}}>
                    <li>Files are staged in the browser and row counts estimated.</li>
                    <li>
                        <strong style={{color: tokens.colors.text}}>Ingest</strong> runs field-mapping and validation
                        against the <code>{target}</code> schema.
                    </li>
                    <li>Valid records flow into the control tower and refresh every view.</li>
                </ol>
                <p
                    style={{
                        marginTop: tokens.space.md,
                        marginBottom: 0,
                        fontSize: 11,
                        color: tokens.colors.textFaint,
                        fontStyle: 'italic',
                    }}
                >
                    Preview build — staged files stay in your browser and are not written to the base.
                </p>
            </Panel>
        </div>
    );
}

const selectStyle: React.CSSProperties = {
    padding: '5px 10px',
    border: `1px solid ${tokens.colors.rule}`,
    borderRadius: tokens.radius.sm,
    fontSize: 12,
    background: tokens.colors.bg,
    fontFamily: tokens.fonts.mono,
    color: tokens.colors.text,
    minWidth: 160,
};

const primaryBtn: React.CSSProperties = {
    padding: '8px 16px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    border: 'none',
    borderRadius: tokens.radius.sm,
    background: tokens.colors.accent,
    color: '#FFFFFF',
};

const secondaryBtn: React.CSSProperties = {
    padding: '8px 14px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    border: `1px solid ${tokens.colors.rule}`,
    borderRadius: tokens.radius.sm,
    background: tokens.colors.bgPanel,
    color: tokens.colors.text,
    cursor: 'pointer',
};
