import {useEffect, useMemo, useRef, useState} from 'react';
import {tokens} from '../../styles/tokens';

export interface DropdownOption {
    value: string;
    label: string;
    /** Optional small badge shown to the right (e.g. count). */
    meta?: string;
    /** Optional accent color rendered as a swatch left of the label. */
    swatch?: string;
}

interface Props {
    label: string;
    options: ReadonlyArray<DropdownOption>;
    selected: ReadonlyArray<string>;
    onChange: (next: string[]) => void;
    /** Label shown when nothing is selected. Defaults to "All". */
    emptyLabel?: string;
    /** Cap the popover width. */
    width?: number;
    /** Render values with a mono font (e.g. for Source_Run identifiers). */
    monoValues?: boolean;
}

export function MultiSelectDropdown({
    label,
    options,
    selected,
    onChange,
    emptyLabel = 'All',
    width = 280,
    monoValues,
}: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const rootRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (!rootRef.current) return;
            if (!rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        return options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
    }, [options, query]);

    const summary = selected.length === 0 ? emptyLabel : `${selected.length} selected`;

    const toggle = (value: string) => {
        if (selected.includes(value)) {
            onChange(selected.filter(v => v !== value));
        } else {
            onChange([...selected, value]);
        }
    };

    const showSearch = options.length > 8;

    return (
        <div ref={rootRef} style={{position: 'relative'}}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    border: `1px solid ${selected.length ? tokens.colors.accent : tokens.colors.rule}`,
                    background: selected.length ? `${tokens.colors.accent}10` : tokens.colors.bg,
                    color: selected.length ? tokens.colors.accent : tokens.colors.text,
                    borderRadius: tokens.radius.sm,
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                    minWidth: 130,
                    justifyContent: 'space-between',
                }}
            >
                <span style={{display: 'inline-flex', gap: 6, alignItems: 'center'}}>
                    <span
                        style={{
                            fontSize: 10,
                            color: tokens.colors.textFaint,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                            fontWeight: 700,
                        }}
                    >
                        {label}
                    </span>
                    <span style={{color: 'inherit'}}>{summary}</span>
                </span>
                <span aria-hidden style={{fontSize: 9, marginLeft: 4}}>{open ? '▴' : '▾'}</span>
            </button>

            {open ? (
                <div
                    role="listbox"
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        width,
                        background: tokens.colors.bgPanel,
                        border: `1px solid ${tokens.colors.rule}`,
                        borderRadius: tokens.radius.md,
                        boxShadow: tokens.shadow.lift,
                        zIndex: 60,
                        display: 'flex',
                        flexDirection: 'column',
                        maxHeight: 320,
                        overflow: 'hidden',
                    }}
                >
                    <div
                        style={{
                            padding: `${tokens.space.sm} ${tokens.space.md}`,
                            borderBottom: `1px solid ${tokens.colors.ruleSoft}`,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: tokens.space.sm,
                        }}
                    >
                        <span className="cia-eyebrow">{label}</span>
                        {selected.length > 0 ? (
                            <button
                                type="button"
                                onClick={() => onChange([])}
                                style={{
                                    fontSize: 10,
                                    color: tokens.colors.textMuted,
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase',
                                    fontWeight: 600,
                                }}
                            >
                                Clear
                            </button>
                        ) : null}
                    </div>

                    {showSearch ? (
                        <input
                            type="text"
                            placeholder="Search…"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            style={{
                                margin: `${tokens.space.sm} ${tokens.space.md} 0`,
                                padding: '5px 8px',
                                border: `1px solid ${tokens.colors.rule}`,
                                borderRadius: tokens.radius.sm,
                                fontSize: 12,
                                fontFamily: tokens.fonts.sans,
                                background: tokens.colors.bg,
                                color: tokens.colors.text,
                                outline: 'none',
                            }}
                        />
                    ) : null}

                    <div
                        className="cia-scroll"
                        style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: tokens.space.sm,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 2,
                            overscrollBehavior: 'contain',
                        }}
                    >
                        {visible.length === 0 ? (
                            <div
                                style={{
                                    padding: tokens.space.md,
                                    fontSize: 12,
                                    color: tokens.colors.textMuted,
                                    fontStyle: 'italic',
                                    textAlign: 'center',
                                }}
                            >
                                No matches.
                            </div>
                        ) : (
                            visible.map(opt => {
                                const active = selected.includes(opt.value);
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => toggle(opt.value)}
                                        title={opt.label}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: tokens.space.sm,
                                            padding: '5px 8px',
                                            borderRadius: tokens.radius.sm,
                                            background: active ? `${tokens.colors.accent}12` : 'transparent',
                                            border: `1px solid ${active ? tokens.colors.accent + '40' : 'transparent'}`,
                                            textAlign: 'left',
                                            fontSize: 12,
                                            color: tokens.colors.text,
                                            fontWeight: active ? 600 : 500,
                                            minWidth: 0,
                                        }}
                                    >
                                        <Checkbox checked={active} />
                                        {opt.swatch ? (
                                            <span
                                                style={{
                                                    width: 10,
                                                    height: 10,
                                                    borderRadius: 2,
                                                    background: opt.swatch,
                                                    flexShrink: 0,
                                                }}
                                            />
                                        ) : null}
                                        <span
                                            style={{
                                                flex: 1,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                fontFamily: monoValues ? tokens.fonts.mono : tokens.fonts.sans,
                                                fontSize: monoValues ? 11 : 12,
                                            }}
                                        >
                                            {opt.label}
                                        </span>
                                        {opt.meta ? (
                                            <span
                                                className="cia-num"
                                                style={{
                                                    fontSize: 10,
                                                    color: tokens.colors.textFaint,
                                                    fontWeight: 600,
                                                    flexShrink: 0,
                                                }}
                                            >
                                                {opt.meta}
                                            </span>
                                        ) : null}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function Checkbox({checked}: {checked: boolean}) {
    return (
        <span
            aria-hidden
            style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                border: `1.5px solid ${checked ? tokens.colors.accent : tokens.colors.rule}`,
                background: checked ? tokens.colors.accent : tokens.colors.bg,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: '#fff',
                fontSize: 10,
                lineHeight: 1,
            }}
        >
            {checked ? '✓' : ''}
        </span>
    );
}
