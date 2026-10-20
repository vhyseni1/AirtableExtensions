// Drag-and-drop reporting-line changes: the state machine and the feedback.
//
// Kept apart from the two boards that use it (the position view and the people
// tree) so both behave identically — the same illegal drops are refused with
// the same wording, and the same toast reports the result.

import {useState, useMemo, useCallback, useEffect} from 'react';
import {collectSubtreeIds, canReparent, applyReparent} from '../lib/reparent';

const NO_IDS = new Set();

export function useReparent(table, cfg, nodeMap) {
    const [dragId, setDragId] = useState(null);
    const [hoverId, setHoverId] = useState(null);
    const [status, setStatus] = useState(null);
    const [busy, setBusy] = useState(false);

    // The board is editable only if the runtime actually offers the write. The
    // interface SDK inherits it from TableCore rather than declaring it, so
    // feature-detect instead of assuming either way.
    const enabled = !!(table && typeof table.updateRecordAsync === 'function');

    // Dropping onto your own descendant would make a loop, so the whole subtree
    // is off limits while you drag. Computed once per drag, not per card.
    const forbidden = useMemo(
        () => (dragId ? collectSubtreeIds(nodeMap, dragId) : NO_IDS),
        [dragId, nodeMap],
    );

    useEffect(() => {
        if (!status) return undefined;
        const t = setTimeout(() => setStatus(null), status.ok ? 3200 : 6000);
        return () => clearTimeout(t);
    }, [status]);

    const onDragStart = useCallback((id, e) => {
        if (!enabled) return;
        setDragId(id);
        setStatus(null);
        if (e && e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            // Firefox refuses to start a drag without payload.
            try { e.dataTransfer.setData('text/plain', id); } catch { /* ignore */ }
        }
    }, [enabled]);

    const onDragEnd = useCallback(() => {
        setDragId(null);
        setHoverId(null);
    }, []);

    // Whether this card may receive the card currently in hand.
    const dropState = useCallback(id => {
        if (!dragId || id === dragId) return null;
        return forbidden.has(id) ? 'forbidden' : 'ok';
    }, [dragId, forbidden]);

    const onDragOver = useCallback((id, e) => {
        if (!dragId || dropState(id) !== 'ok') return;
        e.preventDefault();                       // required to allow the drop
        e.dataTransfer.dropEffect = 'move';
        setHoverId(id);
    }, [dragId, dropState]);

    const onDragLeave = useCallback(id => {
        setHoverId(prev => (prev === id ? null : prev));
    }, []);

    const onDrop = useCallback(async (newParentId, e) => {
        if (e) e.preventDefault();
        const childId = dragId;
        setDragId(null);
        setHoverId(null);
        if (!childId || !enabled) return;

        // Check before writing so an illegal drop never reaches the network.
        const legal = canReparent(nodeMap, childId, newParentId);
        if (!legal.ok) { setStatus({ok: false, reason: legal.reason}); return; }

        setBusy(true);
        const result = await applyReparent(table, cfg, nodeMap, childId, newParentId);
        setBusy(false);
        setStatus({ok: result.ok, reason: result.reason});
    }, [dragId, enabled, nodeMap, table, cfg]);

    // One object so a board can spread it onto a card without naming each prop.
    const cardProps = useCallback(id => {
        if (!enabled) return {};
        const state = dropState(id);
        return {
            draggable: true,
            onDragStart: e => { e.stopPropagation(); onDragStart(id, e); },
            onDragEnd,
            onDragOver: e => onDragOver(id, e),
            onDragLeave: () => onDragLeave(id),
            onDrop: e => { e.stopPropagation(); onDrop(id, e); },
            'data-drag': id === dragId ? 'source' : undefined,
            'data-drop': state && id === hoverId ? state : (state === 'forbidden' ? 'forbidden' : undefined),
        };
    }, [enabled, dropState, dragId, hoverId, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop]);

    return {enabled, dragging: !!dragId, busy, status, cardProps, dismiss: () => setStatus(null)};
}

export function ReparentToast({status, busy, onDismiss}) {
    if (busy) {
        return (
            <div className="reparent-toast is-busy" role="status">
                <span className="reparent-spinner" aria-hidden="true" />
                Updating reporting line…
            </div>
        );
    }
    if (!status) return null;
    return (
        <div className={`reparent-toast ${status.ok ? 'is-ok' : 'is-err'}`} role="status">
            <span className="reparent-icon" aria-hidden="true">{status.ok ? '✓' : '!'}</span>
            <span className="reparent-text">{status.reason}</span>
            <button className="reparent-close" onClick={onDismiss} title="Dismiss">×</button>
        </div>
    );
}

// Shown once on an editable board so the affordance is discoverable — a card
// that can be dragged does not look any different until you try.
export function ReparentHint({enabled}) {
    if (!enabled) return null;
    return <span className="reparent-hint">Drag a card onto a manager to change its reporting line</span>;
}
