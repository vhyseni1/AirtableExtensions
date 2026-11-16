import {useState, type ReactNode} from 'react';
import {tokens} from '../styles/tokens';

export type GuideMode = 'no-data' | 'awaiting-review' | 'modal';

interface Props {
    mode: GuideMode;
    onClose?: () => void;
    /** Total accessible records (any status) — used to tailor the intro. */
    totalCount?: number;
    /** How many are already Reviewed. */
    reviewedCount?: number;
}

type ChapterKey = 'process' | 'data' | 'dashboards';

interface Chapter {
    key: ChapterKey;
    n: string;
    label: string;
    icon: string;
    blurb: string;
}

const CHAPTERS: ReadonlyArray<Chapter> = [
    {key: 'process', n: '01', label: 'Overall process', icon: '🔄', blurb: 'The five stages that take raw notes to a live, decision-ready view — and where you fit in.'},
    {key: 'data', n: '02', label: 'Data', icon: '🗂️', blurb: 'How to see your data, import it, review it so it becomes visible, and what every field stores.'},
    {key: 'dashboards', n: '03', label: 'Dashboards', icon: '📊', blurb: 'Every tab and every visual, what it shows and how to read it.'},
];

function defaultChapter(mode: GuideMode): ChapterKey {
    return mode === 'modal' ? 'process' : 'data';
}

/**
 * Onboarding + reference guide, organised into chapters. Rendered full-width as
 * the empty state when a user has no visible data, and as a modal (Help button)
 * when they do.
 */
export function HelpGuide({mode, onClose, totalCount = 0, reviewedCount = 0}: Props) {
    const [chapter, setChapter] = useState<ChapterKey>(defaultChapter(mode));
    const active = CHAPTERS.find(c => c.key === chapter) ?? CHAPTERS[0]!;

    const body = (
        <div style={{display: 'flex', flexDirection: 'column', gap: tokens.space.lg}}>
            {mode !== 'modal' ? <EmptyIntro mode={mode} totalCount={totalCount} reviewedCount={reviewedCount} /> : null}

            <ChapterNav chapters={CHAPTERS} active={chapter} onPick={setChapter} />
            <ChapterHeader chapter={active} />

            <div style={{display: 'flex', flexDirection: 'column', gap: tokens.space.xl}}>
                {chapter === 'process' ? <ProcessOverview /> : null}
                {chapter === 'data' ? (
                    <>
                        <AccessSection />
                        <UploadSection />
                        <ReviewSection />
                        <FieldGlossary />
                    </>
                ) : null}
                {chapter === 'dashboards' ? <ReadingSection /> : null}
            </div>

            <ChapterPager chapters={CHAPTERS} active={chapter} onPick={setChapter} />
        </div>
    );

    if (mode === 'modal') {
        return (
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(2,35,102,0.45)',
                    backdropFilter: 'blur(3px)',
                    zIndex: 220,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    padding: tokens.space.xl,
                }}
            >
                <div
                    onClick={e => e.stopPropagation()}
                    className="cia-scroll"
                    style={{
                        background: tokens.colors.bgPanel,
                        borderRadius: tokens.radius.lg,
                        boxShadow: '0 24px 60px rgba(2,35,102,0.35)',
                        width: 'min(96vw, 1040px)',
                        maxHeight: '92vh',
                        overflow: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    <header
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: tokens.space.md,
                            padding: `${tokens.space.md} ${tokens.space.lg}`,
                            borderBottom: `1px solid ${tokens.colors.rule}`,
                            position: 'sticky',
                            top: 0,
                            background: tokens.colors.bgPanel,
                            zIndex: 1,
                        }}
                    >
                        <div style={{display: 'flex', flexDirection: 'column', gap: 1}}>
                            <span className="cia-eyebrow">Help &amp; guide</span>
                            <h2 style={{margin: 0, fontFamily: tokens.fonts.serif, fontSize: 20, fontWeight: 600, color: tokens.colors.text}}>
                                How the Control Tower works
                            </h2>
                        </div>
                        <button type="button" onClick={onClose} style={closeBtn}>
                            Close ✕
                        </button>
                    </header>
                    <div style={{padding: tokens.space.xl}}>{body}</div>
                </div>
            </div>
        );
    }

    return (
        <div
            style={{
                background: tokens.colors.bgPanel,
                border: `1px solid ${tokens.colors.rule}`,
                borderRadius: tokens.radius.md,
                boxShadow: tokens.shadow.panel,
                padding: tokens.space.xxl,
                maxWidth: 1040,
                margin: '0 auto',
                width: '100%',
            }}
        >
            {body}
        </div>
    );
}

/* ---------- Intro (empty-state only) ---------- */

function EmptyIntro({mode, totalCount, reviewedCount}: {mode: GuideMode; totalCount: number; reviewedCount: number}) {
    const awaiting = mode === 'awaiting-review';
    return (
        <div
            style={{
                display: 'flex',
                gap: tokens.space.lg,
                padding: tokens.space.lg,
                borderRadius: tokens.radius.md,
                background: `linear-gradient(100deg, ${tokens.colors.accentDeep} 0%, ${tokens.colors.accent} 100%)`,
                color: '#FFFFFF',
            }}
        >
            <span aria-hidden style={{fontSize: 30, lineHeight: 1}}>
                {awaiting ? '⏳' : '👋'}
            </span>
            <div style={{display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0}}>
                <h1 style={{margin: 0, fontFamily: tokens.fonts.serif, fontSize: 22, fontWeight: 600}}>
                    {awaiting ? 'Your data is waiting to be reviewed' : 'Nothing to show here yet'}
                </h1>
                <p style={{margin: 0, fontSize: 14, lineHeight: 1.55, color: tokens.colors.accentTint, maxWidth: 760}}>
                    {awaiting ? (
                        <>
                            You can see <strong style={{color: '#fff'}}>{totalCount}</strong> record
                            {totalCount === 1 ? '' : 's'}, but <strong style={{color: '#fff'}}>{reviewedCount}</strong> are
                            marked <em>Reviewed</em>. The dashboard only shows reviewed records — everything still{' '}
                            <em>Pending</em> stays hidden until you validate it. Jump to{' '}
                            <strong style={{color: '#fff'}}>Review your data</strong> below.
                        </>
                    ) : (
                        <>
                            This can mean two things: you haven&apos;t been <strong style={{color: '#fff'}}>given access</strong> to
                            any records yet, or no data has been <strong style={{color: '#fff'}}>uploaded and reviewed</strong>.
                            The short guide below walks you through getting your data in and making it visible.
                        </>
                    )}
                </p>
            </div>
        </div>
    );
}

/* ---------- Chapter navigation ---------- */

function ChapterNav({chapters, active, onPick}: {chapters: ReadonlyArray<Chapter>; active: ChapterKey; onPick: (k: ChapterKey) => void}) {
    return (
        <nav style={{display: 'flex', gap: tokens.space.sm, flexWrap: 'wrap'}}>
            {chapters.map(c => {
                const on = c.key === active;
                return (
                    <button
                        key={c.key}
                        type="button"
                        onClick={() => onPick(c.key)}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 14px',
                            borderRadius: tokens.radius.sm,
                            border: `1px solid ${on ? tokens.colors.accent : tokens.colors.rule}`,
                            background: on ? tokens.colors.accent : tokens.colors.bgPanel,
                            color: on ? '#FFFFFF' : tokens.colors.text,
                            cursor: 'pointer',
                            transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease',
                        }}
                    >
                        <span aria-hidden style={{fontFamily: tokens.fonts.mono, fontSize: 11, fontWeight: 700, opacity: on ? 0.85 : 0.5}}>
                            {c.n}
                        </span>
                        <span style={{fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase'}}>
                            {c.label}
                        </span>
                    </button>
                );
            })}
        </nav>
    );
}

function ChapterHeader({chapter}: {chapter: Chapter}) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: tokens.space.md,
                padding: `${tokens.space.md} ${tokens.space.lg}`,
                borderRadius: tokens.radius.md,
                background: tokens.colors.bgAlt,
                borderLeft: `4px solid ${tokens.colors.accent}`,
            }}
        >
            <span aria-hidden style={{fontSize: 26, lineHeight: 1}}>{chapter.icon}</span>
            <div style={{display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0}}>
                <span className="cia-eyebrow" style={{color: tokens.colors.accent}}>Chapter {chapter.n}</span>
                <h2 style={{margin: 0, fontFamily: tokens.fonts.serif, fontSize: 20, fontWeight: 600, color: tokens.colors.text}}>
                    {chapter.label}
                </h2>
                <span style={{fontSize: 12.5, color: tokens.colors.textMuted, lineHeight: 1.5}}>{chapter.blurb}</span>
            </div>
        </div>
    );
}

function ChapterPager({chapters, active, onPick}: {chapters: ReadonlyArray<Chapter>; active: ChapterKey; onPick: (k: ChapterKey) => void}) {
    const idx = chapters.findIndex(c => c.key === active);
    const prev = idx > 0 ? chapters[idx - 1] : null;
    const next = idx < chapters.length - 1 ? chapters[idx + 1] : null;
    if (!prev && !next) return null;
    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: tokens.space.md,
                paddingTop: tokens.space.md,
                borderTop: `1px solid ${tokens.colors.rule}`,
            }}
        >
            {prev ? (
                <button type="button" onClick={() => onPick(prev.key)} style={pagerBtn}>
                    ← {prev.label}
                </button>
            ) : (
                <span />
            )}
            {next ? (
                <button type="button" onClick={() => onPick(next.key)} style={{...pagerBtn, borderColor: tokens.colors.accent, color: tokens.colors.accent}}>
                    {next.label} →
                </button>
            ) : (
                <span />
            )}
        </div>
    );
}

/* ---------- Sections ---------- */

function ProcessOverview() {
    const steps: {n: string; title: string; body: string}[] = [
        {n: '1', title: 'Capture', body: 'Workshops, interviews and sessions produce raw material — transcripts, notes, flip charts, KDI, Lucid boards.'},
        {n: '2', title: 'Extract', body: 'An LLM (Google Notebook or the model designated by your change lead) turns that raw material into structured impact rows.'},
        {n: '3', title: 'Upload', body: 'You paste those rows into the “Upload & review source data” tab in Airtable.'},
        {n: '4', title: 'Review', body: 'You check each row and set Validation_Status to Reviewed. Only reviewed rows become visible.'},
        {n: '5', title: 'Visualise', body: 'Reviewed rows flow into this dashboard — heat maps, flows, radars and funnels — ready to act on.'},
    ];
    return (
        <Section eyebrow="The big picture" title="The overall process" intro="Five stages take a pile of unstructured notes to a live, decision-ready view.">
            <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: tokens.space.sm}}>
                {steps.map(s => (
                    <div
                        key={s.n}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                            padding: tokens.space.md,
                            background: tokens.colors.bgAlt,
                            border: `1px solid ${tokens.colors.rule}`,
                            borderRadius: tokens.radius.md,
                        }}
                    >
                        <span
                            style={{
                                width: 24,
                                height: 24,
                                borderRadius: '50%',
                                background: tokens.colors.accent,
                                color: '#fff',
                                fontSize: 12,
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            {s.n}
                        </span>
                        <span style={{fontFamily: tokens.fonts.serif, fontWeight: 600, fontSize: 14, color: tokens.colors.text}}>
                            {s.title}
                        </span>
                        <span style={{fontSize: 12, color: tokens.colors.textMuted, lineHeight: 1.5}}>{s.body}</span>
                    </div>
                ))}
            </div>
        </Section>
    );
}

function AccessSection() {
    return (
        <Section
            eyebrow="Step 1"
            title="See your data — access & ownership"
            intro="Records are private by default. Two columns decide what you can see:"
        >
            <KeyValue
                rows={[
                    ['Created', 'Automatically stamps the user who created each record. If you created it, you can see it — you are its owner.'],
                    ['Accessible by', 'A user field where the owner grants access to other people. If your name is here, the record shows up for you too.'],
                ]}
            />
            <Callout tone="info">
                If the dashboard is empty, it usually means no one has created records under your name or added you to{' '}
                <strong>Accessible&nbsp;by</strong>. Either ask the record owner (your change lead) to add you, or import your own
                data using the steps below.
            </Callout>
        </Section>
    );
}

function UploadSection() {
    return (
        <Section
            eyebrow="Step 2"
            title="Import data — the Upload tab"
            intro="To bring in your own data, go to the “Upload & review source data” tab in Airtable."
        >
            <ol style={listStyle}>
                <li>
                    Open <strong>Google Notebook</strong> (or the LLM your change lead has designated) where your sessions were
                    processed.
                </li>
                <li>
                    <strong>Copy</strong> the structured impact rows it produced.
                </li>
                <li>
                    Switch to the <strong>“Upload &amp; review source data”</strong> tab and <strong>paste</strong> the rows in.
                </li>
                <li>Each pasted row lands as a new record with Validation_Status set to <em>Pending</em>.</li>
            </ol>
            <Callout tone="info">
                Pasting is the only thing you do manually — field mapping and structure come from the LLM export your change lead set up.
            </Callout>
        </Section>
    );
}

function ReviewSection() {
    return (
        <Section
            eyebrow="Step 3"
            title="Review your data — Pending → Reviewed"
            intro="This is the step that makes data appear. The dashboard shows ONLY records whose Validation_Status is Reviewed."
        >
            <ol style={listStyle}>
                <li>
                    Work through the records <strong>one by one</strong>. Start with the ones that have the{' '}
                    <strong>lowest Confidence</strong> — those are the most likely to need a correction.
                </li>
                <li>Check the extracted fields against the Source_Quote and fix anything the LLM got wrong.</li>
                <li>
                    Set <strong>Validation_Status → Reviewed</strong> once you&apos;re happy. (Set it to <em>Discarded</em> to drop a
                    bad row.)
                </li>
            </ol>
            <Callout tone="warn">
                Until a record is marked <strong>Reviewed</strong>, it will <strong>not</strong> appear anywhere in the dashboard —
                not in totals, heat maps, flows or radars. If you&apos;ve uploaded data but still see nothing, this is almost always why.
            </Callout>
        </Section>
    );
}

function ReadingSection() {
    const tabs: {tab: string; what: string; visuals: {name: string; desc: string}[]}[] = [
        {
            tab: 'Top of every screen',
            what: 'Always visible — your headline numbers and the filters that drive every view.',
            visuals: [
                {name: 'Headline tiles', desc: 'All reviewed impacts, High-impact records, Open gaps, Pressure flags, Friction points, Lower-confidence impacts. Click a tile to drill into those exact records.'},
                {name: 'Filter bar', desc: 'Narrow every visual at once by Source run, Affiliate, Business archetype, Role, Tag and Change impact. Clearing filters widens the view back out.'},
            ],
        },
        {
            tab: 'Overview',
            what: 'The one-screen situation report.',
            visuals: [
                {name: 'Impact matrix (heat map)', desc: 'Role × Change_Category grid. Cell shade = number of impacts; colour = average severity. Click any cell to see the records behind it.'},
                {name: 'Diagnostic grid', desc: 'Native Airtable list of the records in focus — click a row to open and edit the full record.'},
                {name: 'Source trace', desc: 'The evidence behind the selected impact — its Source_Quote, documents and key fields.'},
            ],
        },
        {
            tab: 'Heat maps',
            what: 'Where the impact concentrates, sliced different ways.',
            visuals: [
                {name: 'Affiliate × Change_Component', desc: 'Which markets carry which specific changes.'},
                {name: 'Archetype × Change_Category', desc: 'Which business archetypes carry which change pillars.'},
                {name: 'Change_Component × Role', desc: 'Who feels each system/process change — colour by average Change_Impact.'},
                {name: 'Build your own heat map', desc: 'Pick any X, Y and cell metric. Cells stay clickable so you can drill into records.'},
            ],
        },
        {
            tab: 'Waterfalls',
            what: 'How a population narrows down stage by stage.',
            visuals: [
                {name: 'Validation pipeline', desc: 'Extracted → minus Pending → minus Discarded → Reviewed. Shows how much of your data is actually live.'},
                {name: 'Severity / Confidence funnels', desc: 'From total down to high-severity or high-confidence, dropping each band.'},
                {name: 'Run-over-run delta', desc: 'Prior run + new − resolved = current run, when you have more than one source run.'},
            ],
        },
        {
            tab: 'Flows',
            what: 'How impacts travel across three linked dimensions (Sankey diagrams).',
            visuals: [
                {name: 'Affiliate → Category → Impact', desc: 'Where the heat is, regionally. Click any node to pin and highlight its full path.'},
                {name: 'Role → Category → Tag', desc: 'Who is exposed to what kind of issue.'},
                {name: 'Archetype → Category → Impact', desc: 'Which archetypes carry which pillars, at what severity.'},
            ],
        },
        {
            tab: 'Radars',
            what: 'Profile shapes — compare several things across the same spokes.',
            visuals: [
                {name: 'Role profile', desc: 'Compare how selected roles are exposed across categories, tags or top components (pick roles top-right).'},
                {name: 'Affiliate risk profile', desc: 'A composite risk shape per market across five risk densities.'},
                {name: 'Category severity / signal profiles', desc: 'Which pillars carry High/Medium/Low impact, and where Heatmap/Pressure/Gap/Friction concentrate.'},
            ],
        },
        {
            tab: 'Add data',
            what: 'A staging surface to select captured session artefacts and run them through processing.',
            visuals: [
                {name: 'Source library', desc: 'Pick transcripts, flip charts, notes, KDI and Lucid boards by session date, then process them into structured impacts.'},
            ],
        },
    ];
    return (
        <Section eyebrow="Every visual" title="Read the dashboard — every visual explained" intro="The dashboard is organised into tabs. Here is what each one shows and how to use it.">
            <div style={{display: 'flex', flexDirection: 'column', gap: tokens.space.md}}>
                {tabs.map(t => (
                    <div key={t.tab} style={{borderLeft: `3px solid ${tokens.colors.accent}`, paddingLeft: tokens.space.md}}>
                        <div style={{display: 'flex', alignItems: 'baseline', gap: tokens.space.sm, flexWrap: 'wrap'}}>
                            <span style={{fontFamily: tokens.fonts.serif, fontWeight: 600, fontSize: 15, color: tokens.colors.text}}>
                                {t.tab}
                            </span>
                            <span style={{fontSize: 12, color: tokens.colors.textMuted}}>{t.what}</span>
                        </div>
                        <ul style={{margin: '6px 0 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3}}>
                            {t.visuals.map(v => (
                                <li key={v.name} style={{fontSize: 13, color: tokens.colors.textMuted, lineHeight: 1.5}}>
                                    <strong style={{color: tokens.colors.text}}>{v.name}</strong> — {v.desc}
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </Section>
    );
}

function FieldGlossary() {
    const fields: [string, string][] = [
        ['ID', 'The record’s own number — a stable handle for referencing a specific impact.'],
        ['Validation_Status', 'Pending, Reviewed or Discarded. The gatekeeper — only Reviewed records appear on the dashboard.'],
        ['Source_Run', 'Which capture/extraction run the record came from. Lets you compare run over run.'],
        ['Business_Archetypes', 'Which business archetypes this impact applies to (e.g. i8 First Mover, Global Function).'],
        ['Affiliate', 'The market / region the impact belongs to (Global, DE, UK, FR, …).'],
        ['Role', 'The role affected by the change.'],
        ['Persona (from Role)', 'A persona grouping auto-derived from Role in Airtable — no manual entry.'],
        ['Change_Category', 'One of the eight change pillars (Process, Technology, Data, Analytics, Roles, Skills, Mindset, Engagement).'],
        ['Change_Component', 'The specific system, process or capability that is changing.'],
        ['Description_As-Is', 'The current state — how things work today.'],
        ['Description_To-Be', 'The future state — how things will work after the change.'],
        ['Change_Impact', 'Severity of the impact: High, Medium or Low.'],
        ['Confidence', 'How confident the extraction is: High, Medium or Low. Review low-confidence rows first.'],
        ['Tags', 'Signal tags: Heatmap, Pressure, Gap, Friction — used across the heat maps and radars.'],
        ['Source_Quote', 'The verbatim quote the record was extracted from — your evidence when reviewing.'],
        ['Source_Doc', 'The document or session the quote came from.'],
        ['Action_Required', 'What needs to be done about this impact.'],
        ['Responsible', 'Who owns delivery: ECL Workstream, ELEVATE Program or Beyond ELEVATE.'],
        ['ECL_Stream', 'The change sub-stream: Comms, Change, Training or Other.'],
        ['Action_Owner', 'The named person accountable for the action.'],
        ['Timeline', 'When the action is expected to happen.'],
        ['Dependencies', 'What this impact or action depends on.'],
        ['Notes', 'Free-text notes captured during review.'],
    ];
    return (
        <Section eyebrow="Reference" title="Field glossary — what each column stores" intro="Every field on an impact record and what it means.">
            <KeyValue rows={fields} mono />
        </Section>
    );
}

/* ---------- Primitives ---------- */

function Section({eyebrow, title, intro, children}: {eyebrow: string; title: string; intro?: string; children: ReactNode}) {
    return (
        <section style={{display: 'flex', flexDirection: 'column', gap: tokens.space.sm}}>
            <div style={{display: 'flex', flexDirection: 'column', gap: 2}}>
                <span className="cia-eyebrow" style={{color: tokens.colors.accent}}>{eyebrow}</span>
                <h3 style={{margin: 0, fontFamily: tokens.fonts.serif, fontSize: 18, fontWeight: 600, color: tokens.colors.text}}>
                    {title}
                </h3>
                {intro ? <p style={{margin: 0, fontSize: 13, color: tokens.colors.textMuted, lineHeight: 1.55}}>{intro}</p> : null}
            </div>
            {children}
        </section>
    );
}

function KeyValue({rows, mono}: {rows: [string, string][]; mono?: boolean}) {
    return (
        <div style={{display: 'flex', flexDirection: 'column', border: `1px solid ${tokens.colors.rule}`, borderRadius: tokens.radius.md, overflow: 'hidden'}}>
            {rows.map(([k, v], i) => (
                <div
                    key={k}
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '200px 1fr',
                        gap: tokens.space.md,
                        padding: `${tokens.space.sm} ${tokens.space.md}`,
                        background: i % 2 === 0 ? tokens.colors.bgPanel : tokens.colors.bgAlt,
                        borderTop: i === 0 ? 'none' : `1px solid ${tokens.colors.ruleSoft}`,
                    }}
                >
                    <span
                        style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: tokens.colors.text,
                            fontFamily: mono ? tokens.fonts.mono : tokens.fonts.sans,
                            wordBreak: 'break-word',
                        }}
                    >
                        {k}
                    </span>
                    <span style={{fontSize: 13, color: tokens.colors.textMuted, lineHeight: 1.5}}>{v}</span>
                </div>
            ))}
        </div>
    );
}

const listStyle: React.CSSProperties = {
    margin: 0,
    paddingLeft: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 13,
    color: tokens.colors.textMuted,
    lineHeight: 1.55,
};

const pagerBtn: React.CSSProperties = {
    padding: '8px 14px',
    border: `1px solid ${tokens.colors.rule}`,
    borderRadius: tokens.radius.sm,
    background: tokens.colors.bgPanel,
    color: tokens.colors.text,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    cursor: 'pointer',
};

function Callout({tone, children}: {tone: 'info' | 'warn'; children: ReactNode}) {
    const warn = tone === 'warn';
    return (
        <div
            style={{
                display: 'flex',
                gap: tokens.space.sm,
                padding: tokens.space.md,
                borderRadius: tokens.radius.md,
                background: warn ? '#FFF6E6' : tokens.colors.accentTint,
                border: `1px solid ${warn ? '#F0B400' : tokens.colors.accent}`,
                fontSize: 13,
                color: tokens.colors.text,
                lineHeight: 1.55,
            }}
        >
            <span aria-hidden style={{flexShrink: 0}}>{warn ? '⚠️' : 'ℹ️'}</span>
            <span>{children}</span>
        </div>
    );
}

const closeBtn: React.CSSProperties = {
    padding: '6px 12px',
    border: `1px solid ${tokens.colors.rule}`,
    borderRadius: tokens.radius.sm,
    background: tokens.colors.bgPanel,
    color: tokens.colors.text,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    cursor: 'pointer',
};
