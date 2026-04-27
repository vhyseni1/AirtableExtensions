import {useEffect, useMemo, useRef, useState} from 'react';
import {tokens} from '../../styles/tokens';
import {type Impact} from '../../utils/schema';
import {EmptyState} from './EmptyState';
import {RecordRow} from './RecordRow';

interface Props {
    title: string;
    eyebrow?: string;
    records: Impact[];
    onClose: () => void;
    onOpenRecord: (id: string) => void;
    onSelect?: (id: string) => void;
    emptyLine?: string;
}

const ROW_HEIGHT = 78;
const VIRTUAL_THRESHOLD = 50;

export function DrillSheet({title, eyebrow, records, onClose, onOpenRecord, onSelect, emptyLine}: Props) {
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
        const overscan = 6;
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
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(26,24,20,0.18)',
                    zIndex: 40,
                }}
            />
            <aside
                style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    right: 0,
                    width: 'min(520px, 90vw)',
                    background: tokens.colors.bgPanel,
                    borderLeft: `1px solid ${tokens.colors.rule}`,
                    boxShadow: '-12px 0 30px rgba(26,24,20,0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    zIndex: 50,
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
                        padding: tokens.space.lg,
                    }}
                >
                    {records.length === 0 ? (
                        <EmptyState line={emptyLine ?? 'No records match this slice. Healthy.'} />
                    ) : (
                        <div style={{display: 'flex', flexDirection: 'column', gap: tokens.space.sm}}>
                            {virtualize ? <div style={{height: padTop}} /> : null}
                            {visible.map(r => (
                                <RecordRow
                                    key={r.id}
                                    impact={r}
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
                    }}
                >
                    <span>Click row to open record</span>
                    <span>Esc to close</span>
                </footer>
            </aside>
        </>
    );
}
