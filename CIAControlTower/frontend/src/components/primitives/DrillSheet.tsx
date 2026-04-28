import {useEffect, useMemo, useRef, useState} from 'react';
import {tokens} from '../../styles/tokens';
import {type Impact} from '../../utils/schema';
import {EmptyState} from './EmptyState';
import {NativeRecordRow} from './NativeRecordRow';

interface AirtableRecord {
    id: string;
    getCellValue(name: string): unknown;
    getCellValueAsString(name: string): string;
}
interface AirtableField {
    id: string;
    name: string;
    type: string;
}

interface Props {
    title: string;
    eyebrow?: string;
    records: Impact[];
    recordsById: ReadonlyMap<string, AirtableRecord>;
    fieldsByName: ReadonlyMap<string, AirtableField>;
    onClose: () => void;
    onOpenRecord: (id: string) => void;
    onSelect?: (id: string) => void;
    emptyLine?: string;
}

const ROW_HEIGHT = 220;
const VIRTUAL_THRESHOLD = 50;

export function DrillSheet({
    title,
    eyebrow,
    records,
    recordsById,
    fieldsByName,
    onClose,
    onOpenRecord,
    onSelect,
    emptyLine,
}: Props) {
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(0);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    useEffect(() => {
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous;
        };
    }, []);

    useEffect(() => {
        const node = scrollRef.current;
        if (!node) return;
        setViewportHeight(node.clientHeight);
        const onResize = () => setViewportHeight(node.clientHeight);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const virtualize = records.length > VIRTUAL_THRESHOLD;
    const {visible, padTop, padBottom} = useMemo(() => {
        if (!virtualize) return {visible: records, padTop: 0, padBottom: 0};
        const overscan = 4;
        const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - overscan);
        const end = Math.min(records.length, start + Math.ceil(viewportHeight / ROW_HEIGHT) + overscan * 2);
        return {
            visible: records.slice(start, end),
            padTop: start * ROW_HEIGHT,
            padBottom: (records.length - end) * ROW_HEIGHT,
        };
    }, [records, virtualize, scrollTop, viewportHeight]);

    return (
        <>
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(2,35,102,0.18)',
                    zIndex: 40,
                }}
            />
            <aside
                onWheel={e => e.stopPropagation()}
                onTouchMove={e => e.stopPropagation()}
                style={{
                    position: 'fixed',
                    top: 0,
                    bottom: 0,
                    right: 0,
                    width: 'min(560px, 92vw)',
                    background: tokens.colors.bg,
                    borderLeft: `1px solid ${tokens.colors.rule}`,
                    boxShadow: '-12px 0 30px rgba(2,35,102,0.10)',
                    display: 'flex',
                    flexDirection: 'column',
                    zIndex: 50,
                    overscrollBehavior: 'contain',
                }}
            >
                <header
                    style={{
                        padding: `${tokens.space.lg} ${tokens.space.xl}`,
                        borderBottom: `1px solid ${tokens.colors.rule}`,
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: tokens.space.md,
                        background: tokens.colors.bgPanel,
                    }}
                >
                    <div>
                        {eyebrow ? <span className="cia-eyebrow">{eyebrow}</span> : null}
                        <h3
                            style={{
                                margin: '4px 0 0 0',
                                fontFamily: tokens.fonts.serif,
                                fontSize: 20,
                                fontWeight: 600,
                                letterSpacing: '-0.01em',
                                color: tokens.colors.text,
                            }}
                        >
                            {title}
                        </h3>
                        <span
                            className="cia-num"
                            style={{
                                fontSize: 12,
                                color: tokens.colors.textMuted,
                                marginTop: 4,
                                display: 'block',
                            }}
                        >
                            {records.length} {records.length === 1 ? 'record' : 'records'}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        style={{
                            width: 28,
                            height: 28,
                            borderRadius: tokens.radius.sm,
                            border: `1px solid ${tokens.colors.rule}`,
                            color: tokens.colors.textMuted,
                            fontSize: 14,
                            lineHeight: 1,
                            background: tokens.colors.bgPanel,
                        }}
                    >
                        ×
                    </button>
                </header>
                <div
                    ref={scrollRef}
                    className="cia-scroll"
                    onScroll={e => setScrollTop((e.target as HTMLDivElement).scrollTop)}
                    style={{
                        flex: 1,
                        overflowY: 'auto',
                        overscrollBehavior: 'contain',
                        padding: tokens.space.lg,
                        background: tokens.colors.bg,
                    }}
                >
                    {records.length === 0 ? (
                        <EmptyState line={emptyLine ?? 'No records match this slice. Healthy.'} />
                    ) : (
                        <div style={{display: 'flex', flexDirection: 'column', gap: tokens.space.sm}}>
                            {virtualize ? <div style={{height: padTop}} /> : null}
                            {visible.map(r => (
                                <NativeRecordRow
                                    key={r.id}
                                    impact={r}
                                    record={recordsById.get(r.id) ?? null}
                                    fieldsByName={fieldsByName}
                                    onOpen={onOpenRecord}
                                    onSelect={onSelect}
                                />
                            ))}
                            {virtualize ? <div style={{height: padBottom}} /> : null}
                        </div>
                    )}
                </div>
                <footer
                    style={{
                        padding: `${tokens.space.sm} ${tokens.space.xl}`,
                        borderTop: `1px solid ${tokens.colors.ruleSoft}`,
                        fontSize: 11,
                        color: tokens.colors.textFaint,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        display: 'flex',
                        justifyContent: 'space-between',
                        background: tokens.colors.bgPanel,
                    }}
                >
                    <span>Click row to open native record</span>
                    <span>Esc to close</span>
                </footer>
            </aside>
        </>
    );
}
