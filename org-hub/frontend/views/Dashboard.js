// Dashboard — the numbers behind the two org charts: headcount and vacancy,
// span of control, management layers, and a breakdown per configured dimension.
//
// Charts are plain CSS bars rather than a charting library: the data here is
// always a small ranked list, and a dependency-free bar keeps the bundle small
// and prints cleanly in the PNG/PDF exports.

import {useMemo, useRef} from 'react';
import {readText} from '../lib/fields';
import {fmtNum as fmt} from '../lib/orgMetrics';
import {depthByNode} from '../lib/people';
import {ExportMenu} from '../components/Controls';
import {StatTile, BarList} from '../components/Charts';
import {toCSV, downloadText, exportPNG} from '../lib/exports';
import {SO_STATUS_COLORS, SCOPING_COLORS, VIZ} from '../config';

// Count records by the text value of a field, dropping blanks.
function countBy(records, field) {
    const counts = new Map();
    if (!field) return [];
    records.forEach(r => {
        const v = readText(r, field).trim();
        if (!v) return;
        counts.set(v, (counts.get(v) || 0) + 1);
    });
    return [...counts.entries()]
        .map(([label, value]) => ({label, value}))
        .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

export default function Dashboard({org, supOrg, peopleTable, supOrgTable, dimensionFields, supOrgDimensionFields}) {
    const {nodeMap, totals} = org;
    const boardRef = useRef(null);

    const people = useMemo(() => Object.values(nodeMap), [nodeMap]);

    const metrics = useMemo(() => {
        const total = people.length;
        const vacant = people.filter(n => n.vacant).length;
        const filled = total - vacant;
        const fte = people.reduce((s, n) => s + (n.fte || 0), 0);
        const managers = people.filter(n => n.childIds.length > 0);
        const spans = managers.map(n => n.childIds.length);
        const avgSpan = spans.length ? spans.reduce((a, b) => a + b, 0) / spans.length : 0;
        const maxSpan = spans.length ? Math.max(...spans) : 0;
        const thinSpans = spans.filter(s => s <= 2).length;
        const depths = depthByNode(nodeMap);
        const depthValues = Object.values(depths);
        const layers = depthValues.length ? Math.max(...depthValues) + 1 : 0;
        const avgDepth = depthValues.length
            ? depthValues.reduce((a, b) => a + b, 0) / depthValues.length
            : 0;
        return {
            total, vacant, filled, fte, managers: managers.length,
            ics: total - managers.length, avgSpan, maxSpan, thinSpans, layers, avgDepth,
            depths,
        };
    }, [people, nodeMap]);

    // Headcount per management layer (layer 0 = the top of the org).
    const layerRows = useMemo(() => {
        const counts = new Map();
        Object.values(metrics.depths).forEach(d => counts.set(d, (counts.get(d) || 0) + 1));
        return [...counts.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([d, value]) => ({label: `Layer ${d + 1}`, value}));
    }, [metrics.depths]);

    // Span of control, bucketed. Managers only.
    const spanRows = useMemo(() => {
        const buckets = [
            {label: '1 report', test: s => s === 1},
            {label: '2–3 reports', test: s => s >= 2 && s <= 3},
            {label: '4–7 reports', test: s => s >= 4 && s <= 7},
            {label: '8–12 reports', test: s => s >= 8 && s <= 12},
            {label: '13+ reports', test: s => s >= 13},
        ];
        const spans = people.filter(n => n.childIds.length > 0).map(n => n.childIds.length);
        return buckets.map(b => ({label: b.label, value: spans.filter(b.test).length}));
    }, [people]);

    // The largest teams, by total descendants.
    const biggestTeams = useMemo(() => people
        .filter(n => n.childIds.length > 0)
        .map(n => ({label: n.displayName, value: totals[n.id] || 0}))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10), [people, totals]);

    const peopleRecords = useMemo(() => people.map(n => n.record), [people]);

    const supOrgNodes = useMemo(
        () => (supOrg ? Object.values(supOrg.nodeMap) : []),
        [supOrg],
    );
    const supOrgRecords = useMemo(() => supOrgNodes.map(n => n.record), [supOrgNodes]);

    // Orgs whose short code no person carries. Only meaningful when the people
    // table actually has short codes — otherwise every org would look empty.
    const emptySupOrgs = useMemo(() => {
        if (!supOrgNodes.length) return 0;
        const codesWithPeople = new Set(people.map(n => n.shortCode).filter(Boolean));
        if (codesWithPeople.size === 0) return 0;
        return supOrgNodes.filter(n => n.shortCode && !codesWithPeople.has(n.shortCode)).length;
    }, [supOrgNodes, people]);

    const exportItems = useMemo(() => [
        {
            label: 'Summary CSV',
            run: () => {
                const rows = [
                    ['Positions', metrics.total],
                    ['Filled', metrics.filled],
                    ['Vacant', metrics.vacant],
                    ['Vacancy rate %', metrics.total ? (metrics.vacant / metrics.total * 100).toFixed(1) : 0],
                    ['Total FTE', metrics.fte.toFixed(2)],
                    ['Managers', metrics.managers],
                    ['Individual contributors', metrics.ics],
                    ['Average span of control', metrics.avgSpan.toFixed(2)],
                    ['Largest span', metrics.maxSpan],
                    ['Managers with ≤2 reports', metrics.thinSpans],
                    ['Management layers', metrics.layers],
                    ['Supervisory organizations', supOrgNodes.length],
                    ['Supervisory orgs with no positions', emptySupOrgs],
                ];
                downloadText(toCSV(['Metric', 'Value'], rows), 'org-dashboard-summary.csv');
            },
        },
        {
            label: 'PNG image',
            run: () => boardRef.current && exportPNG(boardRef.current, 'org-dashboard'),
        },
    ], [metrics, supOrgNodes.length, emptySupOrgs]);

    const vacancyRate = metrics.total ? (metrics.vacant / metrics.total) * 100 : 0;

    return (
        <div className="view-root">
            <div className="toolbar">
                <div className="toolbar-left">
                    <span className="toolbar-label">
                        {peopleTable ? peopleTable.name : 'People'}
                        {supOrgTable ? ` · ${supOrgTable.name}` : ''}
                    </span>
                </div>
                <div className="toolbar-right">
                    <ExportMenu items={exportItems} />
                </div>
            </div>

            <div className="dashboard-scroll" ref={boardRef}>
                <div className="tile-row">
                    <StatTile accent={VIZ.magnitude} label="Positions" value={fmt(metrics.total)} sub={`${fmt(metrics.fte, 1)} FTE`} />
                    <StatTile accent={VIZ.positive} label="Filled" value={fmt(metrics.filled)} tone="good" />
                    <StatTile
                        label="Vacant"
                        accent={VIZ.status.risk.color}
                        value={fmt(metrics.vacant)}
                        sub={`${vacancyRate.toFixed(1)}% of positions`}
                        tone={vacancyRate > 10 ? 'warn' : undefined}
                    />
                    <StatTile accent={VIZ.magnitude} label="Managers" value={fmt(metrics.managers)} sub={`${fmt(metrics.ics)} individual contributors`} />
                    <StatTile accent={VIZ.neutral} label="Avg span of control" value={fmt(metrics.avgSpan, 1)} sub={`largest: ${fmt(metrics.maxSpan)}`} />
                    <StatTile
                        accent={VIZ.neutral} label="Management layers"
                        value={fmt(metrics.layers)}
                        sub={`avg depth ${fmt(metrics.avgDepth + 1, 1)}`}
                    />
                    <StatTile
                        label="Managers with ≤2 reports"
                        value={fmt(metrics.thinSpans)}
                        sub="span-of-control review candidates"
                        tone={metrics.thinSpans > 0 ? 'warn' : undefined}
                    />
                    <StatTile
                        label="Supervisory orgs"
                        value={fmt(supOrgNodes.length)}
                        sub={emptySupOrgs ? `${emptySupOrgs} with no positions` : 'all populated'}
                        tone={emptySupOrgs > 0 ? 'warn' : undefined}
                    />
                </div>

                <div className="panel-grid">
                    <BarList title="Headcount by layer" rows={layerRows} />
                    <BarList title="Span of control" rows={spanRows} limit={5} />
                    <BarList title="Largest teams (total reports)" rows={biggestTeams} />

                    {dimensionFields.map(field => (
                        <BarList
                            key={field.id}
                            title={`Positions by ${field.name}`}
                            rows={countBy(peopleRecords, field)}
                        />
                    ))}

                    {supOrgDimensionFields.map(field => {
                        const rows = countBy(supOrgRecords, field).map(r => ({
                            ...r,
                            color: SO_STATUS_COLORS[r.label]
                                || (SCOPING_COLORS[r.label] && SCOPING_COLORS[r.label].dot)
                                || undefined,
                        }));
                        return (
                            <BarList
                                key={field.id}
                                title={`Supervisory orgs by ${field.name}`}
                                rows={rows}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
