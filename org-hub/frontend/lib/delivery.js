// Models for the delivery-side views: the programme plan (PMO) and the
// employee conversation tracker (HR).
//
// Both tables are optional. Each `build*` returns `{available: false}` rather
// than throwing when its table is missing, so the view can explain what it
// needs instead of rendering an empty shell.

import {readText, readNumber, findFieldByName} from './fields';
import {PROGRAMME, MILESTONE_STATUS, CONVERSATIONS, CONVERSATION_STATUS, PHASES} from '../config';

// "Today" for the whole app. A single source so the programme view, the
// conversation view and the executive brief all agree on what is overdue.
export function today() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
}

export const daysBetween = (a, b) => Math.round((b - a) / 86400000);

// ─── Programme ───────────────────────────────────────────────────────────────

export function resolveProgrammeConfig(table) {
    if (!table) return null;
    return {
        workstreamField: findFieldByName(table, PROGRAMME.workstreamField),
        milestoneField: findFieldByName(table, PROGRAMME.milestoneField),
        ownerField: findFieldByName(table, PROGRAMME.ownerField),
        dueDateField: findFieldByName(table, PROGRAMME.dueDateField),
        statusField: findFieldByName(table, PROGRAMME.statusField),
        progressField: findFieldByName(table, PROGRAMME.progressField),
        ragField: findFieldByName(table, PROGRAMME.ragField),
        dependsOnField: findFieldByName(table, PROGRAMME.dependsOnField),
        countryField: findFieldByName(table, PROGRAMME.countryField),
        phaseField: findFieldByName(table, 'Phase'),
    };
}

export function buildProgramme(records, cfg) {
    if (!cfg || !cfg.milestoneField) return {available: false, milestones: []};

    const now = today();

    const milestones = records.map(record => {
        const status = readText(record, cfg.statusField) || 'Not started';
        const meta = MILESTONE_STATUS[status] || {done: false, tone: 'muted'};
        const due = parseDate(readText(record, cfg.dueDateField));
        const daysOut = due ? daysBetween(now, due) : null;
        // A milestone past its date with work still open is late, whatever its
        // typed RAG says. A plan that reports Green after the date has passed is
        // exactly what a PMO view exists to catch, so the derived flag wins on
        // the board and the typed value is kept alongside it.
        const overdue = !meta.done && daysOut != null
            && daysOut < -PROGRAMME.overdueEscalationDays;
        const typedRag = readText(record, cfg.ragField) || 'Green';
        return {
            id: record.id,
            record,
            workstream: readText(record, cfg.workstreamField) || 'Unassigned',
            milestone: readText(record, cfg.milestoneField),
            phase: readText(record, cfg.phaseField) || '',
            owner: readText(record, cfg.ownerField),
            country: readText(record, cfg.countryField),
            due,
            daysOut,
            status,
            done: meta.done,
            progress: cfg.progressField ? readNumber(record, cfg.progressField) : (meta.done ? 100 : 0),
            typedRag,
            rag: overdue ? 'Red' : typedRag,
            overdue,
            dependsOn: readText(record, cfg.dependsOnField),
        };
    }).sort((a, b) => {
        if (a.due && b.due) return a.due - b.due;
        return a.due ? -1 : b.due ? 1 : 0;
    });

    const open = milestones.filter(m => !m.done);
    const overdue = open.filter(m => m.overdue);
    const dueSoon = open.filter(m => !m.overdue && m.daysOut != null && m.daysOut <= 14);

    // Progress weights every milestone equally. Weighting by effort would need
    // effort data the plan doesn't carry, and a fabricated weight is worse than
    // an honest simple average.
    const completion = milestones.length
        ? milestones.reduce((n, m) => n + (m.done ? 100 : m.progress), 0) / milestones.length
        : 0;

    const byWorkstream = [...new Set(milestones.map(m => m.workstream))].map(ws => {
        const items = milestones.filter(m => m.workstream === ws);
        const openItems = items.filter(m => !m.done);
        return {
            workstream: ws,
            owner: items[0] ? items[0].owner : '',
            total: items.length,
            done: items.filter(m => m.done).length,
            overdue: openItems.filter(m => m.overdue).length,
            progress: items.reduce((n, m) => n + (m.done ? 100 : m.progress), 0) / items.length,
            // The worst RAG in a workstream is the workstream's RAG: an amber
            // average would hide a single red milestone, which is the one thing
            // the reader is looking for.
            rag: openItems.some(m => m.rag === 'Red') ? 'Red'
                : openItems.some(m => m.rag === 'Amber') ? 'Amber' : 'Green',
            items,
        };
    }).sort((a, b) => b.overdue - a.overdue || a.workstream.localeCompare(b.workstream));

    const byPhase = PHASES.map(phase => {
        const items = milestones.filter(m => m.phase === phase);
        return {
            phase,
            total: items.length,
            done: items.filter(m => m.done).length,
            progress: items.length
                ? items.reduce((n, m) => n + (m.done ? 100 : m.progress), 0) / items.length
                : 0,
        };
    }).filter(p => p.total > 0);

    // The phase the programme is actually in: the earliest that isn't finished.
    const currentPhase = byPhase.find(p => p.done < p.total) || byPhase[byPhase.length - 1] || null;

    const nextMilestone = open.find(m => m.daysOut != null && m.daysOut >= 0) || open[0] || null;

    return {
        available: true,
        milestones, open, overdue, dueSoon,
        completion, byWorkstream, byPhase, currentPhase, nextMilestone,
        ragCounts: {
            Red: open.filter(m => m.rag === 'Red').length,
            Amber: open.filter(m => m.rag === 'Amber').length,
            Green: open.filter(m => m.rag === 'Green').length,
        },
    };
}

// ─── Employee conversations ──────────────────────────────────────────────────

export function resolveConversationsConfig(table) {
    if (!table) return null;
    return {
        employeeField: findFieldByName(table, CONVERSATIONS.employeeField),
        managerField: findFieldByName(table, CONVERSATIONS.managerField),
        orgField: findFieldByName(table, CONVERSATIONS.orgField),
        countryField: findFieldByName(table, CONVERSATIONS.countryField),
        typeField: findFieldByName(table, CONVERSATIONS.typeField),
        statusField: findFieldByName(table, CONVERSATIONS.statusField),
        scheduledField: findFieldByName(table, CONVERSATIONS.scheduledField),
        heldField: findFieldByName(table, CONVERSATIONS.heldField),
        outcomeField: findFieldByName(table, CONVERSATIONS.outcomeField),
        sentimentField: findFieldByName(table, CONVERSATIONS.sentimentField),
    };
}

export function buildConversations(records, cfg, {owed = 0} = {}) {
    if (!cfg || !cfg.employeeField) {
        // No tracking table: the view still knows how many conversations the
        // design owes, which is the number an HR lead actually asks for first.
        return {available: false, owed, rows: []};
    }

    const now = today();

    const rows = records.map(record => {
        const status = readText(record, cfg.statusField) || 'To schedule';
        const meta = CONVERSATION_STATUS[status] || {tone: 'muted', done: false};
        const scheduled = parseDate(readText(record, cfg.scheduledField));
        const held = parseDate(readText(record, cfg.heldField));
        return {
            id: record.id,
            record,
            employee: readText(record, cfg.employeeField),
            manager: readText(record, cfg.managerField),
            org: readText(record, cfg.orgField),
            country: readText(record, cfg.countryField),
            type: readText(record, cfg.typeField),
            status,
            done: meta.done,
            tone: meta.tone,
            scheduled,
            held,
            daysOut: scheduled ? daysBetween(now, scheduled) : null,
            outcome: readText(record, cfg.outcomeField),
            sentiment: readText(record, cfg.sentimentField),
        };
    });

    const counts = {};
    Object.keys(CONVERSATION_STATUS).forEach(k => { counts[k] = 0; });
    rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });

    const heldRows = rows.filter(r => r.status === 'Held');
    const sentiment = {};
    heldRows.forEach(r => {
        if (!r.sentiment) return;
        sentiment[r.sentiment] = (sentiment[r.sentiment] || 0) + 1;
    });

    const group = key => {
        const map = new Map();
        rows.forEach(r => {
            const k = r[key] || '—';
            const row = map.get(k) || {key: k, total: 0, held: 0, scheduled: 0, toSchedule: 0, declined: 0};
            row.total += 1;
            if (r.status === 'Held') row.held += 1;
            else if (r.status === 'Scheduled') row.scheduled += 1;
            else if (r.status === 'Declined') row.declined += 1;
            else row.toSchedule += 1;
            map.set(k, row);
        });
        return [...map.values()].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
    };

    // Tracked rows vs. what the design owes. A gap means people are in scope
    // with no conversation record at all — the worst kind of miss, so it is a
    // first-class number rather than something to infer from two totals.
    const untracked = Math.max(0, owed - rows.length);

    return {
        available: true,
        rows,
        owed: owed || rows.length,
        untracked,
        counts,
        heldPct: rows.length ? (counts.Held / rows.length) * 100 : 0,
        sentiment,
        byManager: group('manager'),
        byOrg: group('org'),
        byCountry: group('country'),
        upcoming: rows
            .filter(r => r.status === 'Scheduled' && r.daysOut != null && r.daysOut >= 0)
            .sort((a, b) => a.daysOut - b.daysOut)
            .slice(0, 8),
    };
}
