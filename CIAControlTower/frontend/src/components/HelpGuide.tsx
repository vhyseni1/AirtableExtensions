import {useState, type ReactNode} from 'react';
import {tokens} from '../styles/tokens';

// Apple-leaning surface language: large soft radii, soft shadows instead of
// hard 1px borders, generous whitespace, a single calm accent.
const RADIUS = {card: 16, inner: 12, pill: 980};
const SHADOW = {
    card: '0 1px 2px rgba(2,35,102,0.04), 0 8px 24px -12px rgba(2,35,102,0.16)',
    raised: '0 1px 2px rgba(2,35,102,0.06), 0 1px 1px rgba(2,35,102,0.04)',
    modal: '0 30px 80px -20px rgba(2,35,102,0.4)',
};

export type GuideMode = 'no-data' | 'awaiting-review' | 'modal';

interface Props {
    mode: GuideMode;
    onClose?: () => void;
    /** Total accessible records (any status) — used to tailor the intro. */
    totalCount?: number;
    /** How many are already Reviewed. */
    reviewedCount?: number;
    /** True when the table gates records by Created / Accessible-by. */
    accessControlled?: boolean;
}

type ChapterKey = 'process' | 'data' | 'dashboards';

interface Chapter {
    key: ChapterKey;
    n: string;
    label: string;
    blurb: string;
}

const CHAPTERS: ReadonlyArray<Chapter> = [
    {key: 'process', n: '01', label: 'Overall process', blurb: 'The five stages that take raw notes to a live, decision-ready view — and where you fit in.'},
    {key: 'data', n: '02', label: 'Data', blurb: 'How to see your data, import it, review it so it becomes visible, and what every field holds.'},
    {key: 'dashboards', n: '03', label: 'Dashboards', blurb: 'Every tab and every visual — what it shows and how to read it.'},
];

function defaultChapter(mode: GuideMode): ChapterKey {
    return mode === 'modal' ? 'process' : 'data';
}

/**
 * Onboarding and reference guide, organised into chapters. Rendered full-width
 * as the empty state when a user has no visible data, and as a modal (Help
 * button) when they do.
 */
export function HelpGuide({mode, onClose, totalCount = 0, reviewedCount = 0, accessControlled = true}: Props) {
    const [chapter, setChapter] = useState<ChapterKey>(defaultChapter(mode));
    const active = CHAPTERS.find(c => c.key === chapter) ?? CHAPTERS[0]!;

    const body = (
        <div style={{display: 'flex', flexDirection: 'column', gap: tokens.space.xl}}>
            {mode !== 'modal' ? (
                <EmptyIntro mode={mode} totalCount={totalCount} reviewedCount={reviewedCount} accessControlled={accessControlled} />
            ) : null}

            <ChapterNav chapters={CHAPTERS} active={chapter} onPick={setChapter} />
            <ChapterHeader chapter={active} />

            <div style={{display: 'flex', flexDirection: 'column', gap: tokens.space.xxl}}>
                {chapter === 'process' ? <ProcessOverview /> : null}
                {chapter === 'data' ? (
                    <>
                        {accessControlled ? <AccessSection /> : null}
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
                    background: 'rgba(2,35,102,0.32)',
                    backdropFilter: 'blur(8px) saturate(1.1)',
                    WebkitBackdropFilter: 'blur(8px) saturate(1.1)',
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
                        borderRadius: RADIUS.card,
                        boxShadow: SHADOW.modal,
                        width: 'min(94vw, 960px)',
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
                            padding: `${tokens.space.lg} ${tokens.space.xxl}`,
                            position: 'sticky',
                            top: 0,
                            background: 'rgba(255,255,255,0.8)',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            zIndex: 1,
                        }}
                    >
                        <div style={{display: 'flex', flexDirection: 'column', gap: 2}}>
                            <span style={eyebrowStyle}>User guide</span>
                            <h2 style={{margin: 0, fontFamily: tokens.fonts.serif, fontSize: 20, fontWeight: 600, letterSpacing: '-0.015em', color: tokens.colors.text}}>
                                How the Control Tower works
                            </h2>
                        </div>
                        <button type="button" onClick={onClose} style={ghostBtn}>
                            Done
                        </button>
                    </header>
                    <div style={{padding: `${tokens.space.sm} ${tokens.space.xxl} ${tokens.space.xxl}`}}>{body}</div>
                </div>
            </div>
        );
    }

    return (
        <div
            style={{
                background: tokens.colors.bgPanel,
                borderRadius: RADIUS.card,
                boxShadow: SHADOW.card,
                padding: tokens.space.xxl,
                maxWidth: 960,
                margin: '0 auto',
                width: '100%',
            }}
        >
            {body}
        </div>
    );
}

/* ---------- Intro (empty-state only) ---------- */

function EmptyIntro({mode, totalCount, reviewedCount, accessControlled}: {mode: GuideMode; totalCount: number; reviewedCount: number; accessControlled: boolean}) {
    const awaiting = mode === 'awaiting-review';
    return (
        <div
            style={{
                padding: `${tokens.space.xl} ${tokens.space.xxl}`,
                borderRadius: RADIUS.card,
                background: `linear-gradient(135deg, ${tokens.colors.accentDeep} 0%, ${tokens.colors.accent} 100%)`,
                boxShadow: SHADOW.card,
                color: '#FFFFFF',
            }}
        >
            <span style={{...eyebrowStyle, color: tokens.colors.accentTint}}>
                {awaiting ? 'Validation required' : 'Getting started'}
            </span>
            <h1 style={{margin: '8px 0 10px', fontFamily: tokens.fonts.serif, fontSize: 24, fontWeight: 600, letterSpacing: '-0.01em'}}>
                {awaiting ? 'Your data is waiting to be reviewed' : 'Nothing to show here yet'}
            </h1>
            <p style={{margin: 0, fontSize: 14, lineHeight: 1.6, color: tokens.colors.accentTint, maxWidth: 720}}>
                {awaiting ? (
                    <>
                        You can see <strong style={{color: '#fff'}}>{totalCount}</strong> record
                        {totalCount === 1 ? '' : 's'}, but only <strong style={{color: '#fff'}}>{reviewedCount}</strong>{' '}
                        {reviewedCount === 1 ? 'is' : 'are'} marked Reviewed. The dashboard shows reviewed records only — anything
                        still Pending stays hidden until you validate it. The <strong style={{color: '#fff'}}>Data</strong> chapter
                        below walks through the review step.
                    </>
                ) : accessControlled ? (
                    <>
                        This means one of two things: you have not yet been given access to any records, or no data has been
                        uploaded and reviewed. The guide below walks through getting your data in and making it visible.
                    </>
                ) : (
                    <>
                        No data has been uploaded and reviewed yet. The guide below walks through importing your data and
                        marking it Reviewed so it appears here.
                    </>
                )}
            </p>
        </div>
    );
}

/* ---------- Chapter navigation ---------- */

function ChapterNav({chapters, active, onPick}: {chapters: ReadonlyArray<Chapter>; active: ChapterKey; onPick: (k: ChapterKey) => void}) {
    return (
        <nav
            style={{
                display: 'flex',
                gap: 4,
                padding: 4,
                background: tokens.colors.bgAlt,
                borderRadius: RADIUS.inner,
            }}
        >
            {chapters.map(c => {
                const on = c.key === active;
                return (
                    <button
                        key={c.key}
                        type="button"
                        onClick={() => onPick(c.key)}
                        style={{
                            flex: 1,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 7,
                            padding: '8px 12px',
                            borderRadius: RADIUS.inner - 4,
                            background: on ? tokens.colors.bgPanel : 'transparent',
                            boxShadow: on ? SHADOW.raised : 'none',
                            border: 'none',
                            color: on ? tokens.colors.text : tokens.colors.textMuted,
                            cursor: 'pointer',
                            transition: 'background 160ms ease, color 160ms ease, box-shadow 160ms ease',
                        }}
                    >
                        <span style={{fontFamily: tokens.fonts.mono, fontSize: 11, fontWeight: 600, color: on ? tokens.colors.accent : tokens.colors.textFaint}}>
                            {c.n}
                        </span>
                        <span style={{fontSize: 13, fontWeight: 600, letterSpacing: '0.01em'}}>
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
        <div style={{display: 'flex', alignItems: 'flex-start', gap: tokens.space.lg}}>
            <span
                aria-hidden
                style={{
                    fontFamily: tokens.fonts.serif,
                    fontSize: 46,
                    fontWeight: 300,
                    lineHeight: 0.9,
                    color: tokens.colors.accentTint,
                    letterSpacing: '-0.02em',
                }}
            >
                {chapter.n}
            </span>
            <div style={{display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 2}}>
                <h2 style={{margin: 0, fontFamily: tokens.fonts.serif, fontSize: 24, fontWeight: 600, letterSpacing: '-0.01em', color: tokens.colors.text}}>
                    {chapter.label}
                </h2>
                <p style={{margin: 0, fontSize: 13.5, color: tokens.colors.textMuted, lineHeight: 1.55, maxWidth: 640}}>
                    {chapter.blurb}
                </p>
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
                paddingTop: tokens.space.lg,
                borderTop: `1px solid ${tokens.colors.rule}`,
            }}
        >
            {prev ? <PagerLink dir="prev" chapter={prev} onClick={() => onPick(prev.key)} /> : <span />}
            {next ? <PagerLink dir="next" chapter={next} onClick={() => onPick(next.key)} /> : <span />}
        </div>
    );
}

function PagerLink({dir, chapter, onClick}: {dir: 'prev' | 'next'; chapter: Chapter; onClick: () => void}) {
    const next = dir === 'next';
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: next ? 'flex-end' : 'flex-start',
                gap: 2,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                textAlign: next ? 'right' : 'left',
            }}
        >
            <span style={{...eyebrowStyle, color: tokens.colors.textFaint}}>{next ? 'Next' : 'Previous'}</span>
            <span style={{fontFamily: tokens.fonts.serif, fontSize: 15, fontWeight: 600, color: tokens.colors.accent}}>
                {chapter.label}
            </span>
        </button>
    );
}

/* ---------- Sections ---------- */

interface Stage {
    n: string;
    title: string;
    body: string;
    actor: 'auto' | 'you';
}

const STAGES: ReadonlyArray<Stage> = [
    {n: '01', title: 'Capture', actor: 'auto', body: 'Workshops and sessions produce raw material — transcripts, notes, flip charts, KDI, Lucid boards.'},
    {n: '02', title: 'Extract', actor: 'auto', body: 'An LLM turns that raw material into structured impact rows.'},
    {n: '03', title: 'Upload', actor: 'you', body: 'You paste those rows into the Upload & review tab.'},
    {n: '04', title: 'Review', actor: 'you', body: 'You validate each row and mark it Reviewed.'},
    {n: '05', title: 'Visualise', actor: 'auto', body: 'Reviewed rows flow into the dashboard, ready to act on.'},
];

function ProcessOverview() {
    return (
        <Section eyebrow="The big picture" title="From raw notes to a live view" intro="Five stages, left to right. Two of them are yours.">
            <DiagramFrame>
                <div style={{display: 'flex', minWidth: 680}}>
                    {STAGES.map((s, i) => (
                        <div key={s.n} style={{flex: 1, minWidth: 130, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10}}>
                            <div style={{display: 'flex', alignItems: 'center', width: '100%', height: 44}}>
                                <span style={{flex: 1, height: 2, background: i === 0 ? 'transparent' : tokens.colors.rule}} />
                                <StageNode n={s.n} you={s.actor === 'you'} />
                                <span style={{flex: 1, height: 2, background: i === STAGES.length - 1 ? 'transparent' : tokens.colors.rule, position: 'relative'}}>
                                    {i !== STAGES.length - 1 ? (
                                        <span
                                            aria-hidden
                                            style={{
                                                position: 'absolute',
                                                right: -1,
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                width: 0,
                                                height: 0,
                                                borderTop: '4px solid transparent',
                                                borderBottom: '4px solid transparent',
                                                borderLeft: `6px solid ${tokens.colors.rule}`,
                                            }}
                                        />
                                    ) : null}
                                </span>
                            </div>
                            <div style={{display: 'flex', flexDirection: 'column', gap: 4, padding: '0 6px'}}>
                                <span style={{...eyebrowStyle, color: s.actor === 'you' ? tokens.colors.accent : tokens.colors.textFaint}}>
                                    {s.actor === 'you' ? 'Your step' : 'Automated'}
                                </span>
                                <span style={{fontFamily: tokens.fonts.serif, fontWeight: 600, fontSize: 15, color: tokens.colors.text}}>
                                    {s.title}
                                </span>
                                <span style={{fontSize: 12, color: tokens.colors.textMuted, lineHeight: 1.5}}>{s.body}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </DiagramFrame>
        </Section>
    );
}

function StageNode({n, you}: {n: string; you: boolean}) {
    return (
        <span
            style={{
                flexShrink: 0,
                width: 44,
                height: 44,
                borderRadius: '50%',
                border: you ? 'none' : `1.5px solid ${tokens.colors.accentTint}`,
                background: you ? tokens.colors.accent : tokens.colors.bgPanel,
                color: you ? '#FFFFFF' : tokens.colors.accent,
                boxShadow: you ? '0 4px 12px -2px rgba(11,65,205,0.45)' : SHADOW.raised,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: tokens.fonts.mono,
                fontSize: 13,
                fontWeight: 700,
            }}
        >
            {n}
        </span>
    );
}

function AccessSection() {
    return (
        <Section
            eyebrow="Access & ownership"
            title="Seeing your data"
            intro="Records are private by default. Either condition below makes a record visible to you."
        >
            <AccessDiagram />
            <KeyValue
                rows={[
                    ['Created', 'Automatically stamps the user who created each record. If you created it, you own it — and you can see it.'],
                    ['Accessible by', 'The field where an owner grants access to others. If your name appears here, the record is visible to you too.'],
                ]}
            />
            <Callout tone="info" label="If the dashboard is empty">
                No one has created records under your name, and you have not been added to <strong>Accessible&nbsp;by</strong>. Ask the
                record owner — usually your change lead — to grant you access, or import your own data using the steps that follow.
            </Callout>
        </Section>
    );
}

function UploadSection() {
    return (
        <Section
            eyebrow="Importing"
            title="Bringing data in"
            intro="To add your own data, open the “Upload & review source data” tab in Airtable."
        >
            <Steps
                items={[
                    <>Open <strong>Google Notebook</strong>, or the LLM your change lead has designated, where your sessions were processed.</>,
                    <><strong>Copy</strong> the structured impact rows it produced.</>,
                    <>Switch to the <strong>“Upload &amp; review source data”</strong> tab and <strong>paste</strong> them in.</>,
                    <>Each pasted row lands as a new record with its Validation Status set to <em>Pending</em>.</>,
                ]}
            />
            <Callout tone="info" label="Note">
                Pasting is the only manual step — field mapping and structure come from the LLM export your change lead configured.
            </Callout>
        </Section>
    );
}

function ReviewSection() {
    return (
        <Section
            eyebrow="Reviewing"
            title="Pending becomes Reviewed"
            intro="This is the step that makes data appear. The dashboard shows only records whose Validation Status is Reviewed."
        >
            <ValidationGate />
            <Steps
                items={[
                    <>Work through the records one by one, starting with the <strong>lowest-confidence</strong> ones — those are the most likely to need a correction.</>,
                    <>Check the extracted fields against the Source Quote and fix anything the model got wrong.</>,
                    <>Set <strong>Validation Status to Reviewed</strong> once you are satisfied. Set it to <em>Discarded</em> to drop a bad row.</>,
                ]}
            />
            <Callout tone="warn" label="Important">
                Until a record is marked <strong>Reviewed</strong>, it appears nowhere in the dashboard — not in totals, heat maps,
                flows or radars. If you have uploaded data but still see nothing, this is almost always why.
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
                {name: 'Headline tiles', desc: 'All reviewed impacts, high-impact records, open gaps, pressure flags, friction points and lower-confidence impacts. Select a tile to drill into those exact records.'},
                {name: 'Filter bar', desc: 'Narrows every visual at once — by source run, affiliate, business archetype, role, tag and change impact. Clearing a filter widens the view again.'},
            ],
        },
        {
            tab: 'Overview',
            what: 'The one-screen situation report.',
            visuals: [
                {name: 'Impact matrix', desc: 'A Role × Change Category grid. Shade shows the number of impacts; colour shows average severity. Select any cell to see the records behind it.'},
                {name: 'Diagnostic grid', desc: 'A native Airtable list of the records in focus. Select a row to open and edit the full record.'},
                {name: 'Source trace', desc: 'The evidence behind the selected impact — its source quote, documents and key fields.'},
            ],
        },
        {
            tab: 'Heat maps',
            what: 'Where impact concentrates, sliced several ways.',
            visuals: [
                {name: 'Affiliate × Change Component', desc: 'Which markets carry which specific changes.'},
                {name: 'Archetype × Change Category', desc: 'Which business archetypes carry which change pillars.'},
                {name: 'Change Component × Role', desc: 'Who feels each system or process change, coloured by average impact.'},
                {name: 'Build your own', desc: 'Choose any X, Y and cell metric. Cells stay selectable, so you can drill into records.'},
            ],
        },
        {
            tab: 'Waterfalls',
            what: 'How a population narrows stage by stage.',
            visuals: [
                {name: 'Validation pipeline', desc: 'Extracted, less Pending, less Discarded, to Reviewed — how much of your data is actually live.'},
                {name: 'Severity & confidence funnels', desc: 'From the total down to high-severity or high-confidence, dropping each band.'},
                {name: 'Run-over-run delta', desc: 'Prior run, plus new, less resolved, to the current run — when you have more than one source run.'},
            ],
        },
        {
            tab: 'Flows',
            what: 'How impacts travel across three linked dimensions.',
            visuals: [
                {name: 'Affiliate to Category to Impact', desc: 'Where the heat is, regionally. Select any node to pin and highlight its full path.'},
                {name: 'Role to Category to Tag', desc: 'Who is exposed to which kind of issue.'},
                {name: 'Archetype to Category to Impact', desc: 'Which archetypes carry which pillars, and at what severity.'},
            ],
        },
        {
            tab: 'Radars',
            what: 'Profile shapes that compare several things across the same spokes.',
            visuals: [
                {name: 'Role profile', desc: 'Compares how selected roles are exposed across categories, tags or top components. Choose roles at the top right.'},
                {name: 'Affiliate risk profile', desc: 'A composite risk shape per market across five risk densities.'},
                {name: 'Category profiles', desc: 'Which pillars carry high, medium and low impact, and where pressure, gap and friction concentrate.'},
            ],
        },
        {
            tab: 'Add data',
            what: 'A staging surface for captured session artefacts.',
            visuals: [
                {name: 'Source library', desc: 'Select transcripts, flip charts, notes, KDI and Lucid boards by session date, then process them into structured impacts.'},
            ],
        },
    ];
    return (
        <Section eyebrow="Reading the dashboard" title="Every visual, explained" intro="The dashboard is organised into tabs. Each one is described below.">
            <div style={{display: 'flex', flexDirection: 'column'}}>
                {tabs.map((t, i) => (
                    <div
                        key={t.tab}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '200px 1fr',
                            gap: tokens.space.xl,
                            padding: `${tokens.space.lg} 0`,
                            borderTop: i === 0 ? 'none' : `1px solid ${tokens.colors.ruleSoft}`,
                        }}
                    >
                        <div>
                            <div style={{fontFamily: tokens.fonts.serif, fontWeight: 600, fontSize: 15, color: tokens.colors.text}}>
                                {t.tab}
                            </div>
                            <div style={{fontSize: 12, color: tokens.colors.textMuted, lineHeight: 1.5, marginTop: 4}}>{t.what}</div>
                        </div>
                        <dl style={{margin: 0, display: 'flex', flexDirection: 'column', gap: tokens.space.sm}}>
                            {t.visuals.map(v => (
                                <div key={v.name}>
                                    <dt style={{fontSize: 13, fontWeight: 700, color: tokens.colors.text}}>{v.name}</dt>
                                    <dd style={{margin: 0, fontSize: 13, color: tokens.colors.textMuted, lineHeight: 1.55}}>{v.desc}</dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                ))}
            </div>
        </Section>
    );
}

function FieldGlossary() {
    const fields: [string, string][] = [
        ['ID', 'The record’s own number — a stable handle for a specific impact.'],
        ['Validation_Status', 'Pending, Reviewed or Discarded. The gate: only Reviewed records reach the dashboard.'],
        ['Source_Run', 'The capture or extraction run the record came from, used to compare run over run.'],
        ['Business_Archetypes', 'The business archetypes this impact applies to (for example i8 First Mover, Global Function).'],
        ['Affiliate', 'The market or region the impact belongs to (Global, DE, UK, FR, …).'],
        ['Role', 'The role affected by the change.'],
        ['Persona (from Role)', 'A persona grouping derived automatically from Role — no manual entry.'],
        ['Change_Category', 'One of the eight change pillars, from Process through to Engagement.'],
        ['Change_Component', 'The specific system, process or capability that is changing.'],
        ['Description_As-Is', 'The current state — how things work today.'],
        ['Description_To-Be', 'The future state — how things will work after the change.'],
        ['Change_Impact', 'Severity of the impact: High, Medium or Low.'],
        ['Confidence', 'Confidence in the extraction: High, Medium or Low. Review the lowest first.'],
        ['Tags', 'Signal tags — Heatmap, Pressure, Gap, Friction — used across heat maps and radars.'],
        ['Source_Quote', 'The verbatim quote the record was drawn from — your evidence when reviewing.'],
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
        <Section eyebrow="Reference" title="Field glossary" intro="Every column on an impact record and what it holds.">
            <KeyValue rows={fields} mono />
        </Section>
    );
}

/* ---------- Primitives ---------- */

function Section({eyebrow, title, intro, children}: {eyebrow: string; title: string; intro?: string; children: ReactNode}) {
    return (
        <section style={{display: 'flex', flexDirection: 'column', gap: tokens.space.md}}>
            <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                <span style={eyebrowStyle}>{eyebrow}</span>
                <h3 style={{margin: 0, fontFamily: tokens.fonts.serif, fontSize: 18, fontWeight: 600, color: tokens.colors.text}}>
                    {title}
                </h3>
                {intro ? <p style={{margin: 0, fontSize: 13.5, color: tokens.colors.textMuted, lineHeight: 1.6, maxWidth: 680}}>{intro}</p> : null}
            </div>
            {children}
        </section>
    );
}

function Steps({items}: {items: ReactNode[]}) {
    return (
        <ol style={{margin: 0, padding: 0, listStyle: 'none'}}>
            {items.map((it, i) => {
                const last = i === items.length - 1;
                return (
                    <li key={i} style={{display: 'grid', gridTemplateColumns: '28px 1fr', columnGap: tokens.space.md}}>
                        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                            <span
                                style={{
                                    width: 26,
                                    height: 26,
                                    flexShrink: 0,
                                    borderRadius: '50%',
                                    border: `1.5px solid ${tokens.colors.accent}`,
                                    color: tokens.colors.accent,
                                    background: tokens.colors.bgPanel,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontFamily: tokens.fonts.mono,
                                    fontSize: 11,
                                    fontWeight: 700,
                                }}
                            >
                                {i + 1}
                            </span>
                            {!last ? <span style={{flex: 1, width: 2, background: tokens.colors.rule, minHeight: 10}} /> : null}
                        </div>
                        <span style={{fontSize: 13.5, color: tokens.colors.textMuted, lineHeight: 1.6, padding: `3px 0 ${last ? 0 : tokens.space.md}`}}>
                            {it}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

/* ---------- Diagrams ---------- */

function Node({children, tone = 'plain'}: {children: ReactNode; tone?: 'plain' | 'muted' | 'accent' | 'good' | 'drop'}) {
    const map = {
        plain: {bg: tokens.colors.bgPanel, border: tokens.colors.rule, color: tokens.colors.text},
        muted: {bg: tokens.colors.bgAlt, border: tokens.colors.rule, color: tokens.colors.textMuted},
        accent: {bg: tokens.colors.accentTint, border: tokens.colors.accent, color: tokens.colors.accentDeep},
        good: {bg: '#E7F8EF', border: tokens.colors.sevLow, color: '#046B38'},
        drop: {bg: tokens.colors.bgPanel, border: tokens.colors.rule, color: tokens.colors.textFaint},
    }[tone];
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '10px 14px',
                borderRadius: RADIUS.inner,
                background: map.bg,
                color: map.color,
                boxShadow: tone === 'drop' ? 'none' : SHADOW.raised,
                opacity: tone === 'drop' ? 0.6 : 1,
                fontSize: 12,
                fontWeight: 600,
                lineHeight: 1.3,
                whiteSpace: 'nowrap',
            }}
        >
            {children}
        </span>
    );
}

function Arrow({label, dir = 'right'}: {label?: string; dir?: 'right' | 'down'}) {
    if (dir === 'down') {
        return (
            <span aria-hidden style={{display: 'flex', flexDirection: 'column', alignItems: 'center', color: tokens.colors.textFaint}}>
                <span style={{width: 2, height: 14, background: tokens.colors.rule}} />
                <span style={{width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: `6px solid ${tokens.colors.rule}`}} />
            </span>
        );
    }
    return (
        <span style={{display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 54}}>
            {label ? <span style={{fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: tokens.colors.textFaint, fontWeight: 700}}>{label}</span> : null}
            <span aria-hidden style={{display: 'flex', alignItems: 'center', width: '100%'}}>
                <span style={{flex: 1, height: 2, background: tokens.colors.rule}} />
                <span style={{width: 0, height: 0, borderTop: '4px solid transparent', borderBottom: '4px solid transparent', borderLeft: `6px solid ${tokens.colors.rule}`}} />
            </span>
        </span>
    );
}

function DiagramFrame({children}: {children: ReactNode}) {
    return (
        <div
            className="cia-scroll"
            style={{
                overflowX: 'auto',
                padding: `${tokens.space.xl} ${tokens.space.lg}`,
                background: tokens.colors.bgAlt,
                borderRadius: RADIUS.card,
            }}
        >
            {children}
        </div>
    );
}

function AccessDiagram() {
    return (
        <DiagramFrame>
            <div style={{display: 'flex', alignItems: 'center', gap: tokens.space.md, minWidth: 440}}>
                <div style={{display: 'flex', flexDirection: 'column', gap: tokens.space.sm}}>
                    <Node tone="plain">You created it&nbsp;·&nbsp;<span style={{fontFamily: tokens.fonts.mono, fontWeight: 700}}>Created</span></Node>
                    <div style={{textAlign: 'center', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: tokens.colors.textFaint, fontWeight: 700}}>or</div>
                    <Node tone="plain">You&apos;re listed in&nbsp;<span style={{fontFamily: tokens.fonts.mono, fontWeight: 700}}>Accessible&nbsp;by</span></Node>
                </div>
                <Arrow />
                <Node tone="accent">You can see the record</Node>
            </div>
        </DiagramFrame>
    );
}

function ValidationGate() {
    return (
        <DiagramFrame>
            <div style={{display: 'flex', alignItems: 'center', gap: tokens.space.sm, minWidth: 560}}>
                <Node tone="muted">Pending</Node>
                <Arrow label="You review" />
                <Node tone="good">Reviewed</Node>
                <Arrow />
                <Node tone="accent">Visible on the dashboard</Node>
                <span style={{width: 1, height: 44, background: tokens.colors.rule, margin: `0 ${tokens.space.xs}`}} />
                <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4}}>
                    <Node tone="drop">Discarded</Node>
                    <span style={{fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: tokens.colors.textFaint, fontWeight: 700}}>Dropped</span>
                </div>
            </div>
        </DiagramFrame>
    );
}

function KeyValue({rows, mono}: {rows: [string, string][]; mono?: boolean}) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                background: tokens.colors.bgAlt,
                borderRadius: RADIUS.card,
                padding: `4px ${tokens.space.lg}`,
            }}
        >
            {rows.map(([k, v], i) => (
                <div
                    key={k}
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '210px 1fr',
                        gap: tokens.space.lg,
                        padding: `${tokens.space.md} 0`,
                        borderTop: i === 0 ? 'none' : `1px solid ${tokens.colors.rule}`,
                    }}
                >
                    <span
                        style={{
                            fontSize: mono ? 12 : 13,
                            fontWeight: 600,
                            color: tokens.colors.text,
                            fontFamily: mono ? tokens.fonts.mono : tokens.fonts.sans,
                            wordBreak: 'break-word',
                        }}
                    >
                        {k}
                    </span>
                    <span style={{fontSize: 13, color: tokens.colors.textMuted, lineHeight: 1.55}}>{v}</span>
                </div>
            ))}
        </div>
    );
}

function Callout({tone, label, children}: {tone: 'info' | 'warn'; label: string; children: ReactNode}) {
    const warn = tone === 'warn';
    const dot = warn ? '#E8A317' : tokens.colors.accent;
    return (
        <div
            style={{
                padding: `${tokens.space.md} ${tokens.space.lg}`,
                background: warn ? '#FFFBF2' : tokens.colors.ruleSoft,
                borderRadius: RADIUS.inner,
            }}
        >
            <span style={{display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5}}>
                <span aria-hidden style={{width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0}} />
                <span style={{...eyebrowStyle, color: warn ? '#9A6B00' : tokens.colors.accent}}>{label}</span>
            </span>
            <span style={{fontSize: 13, color: tokens.colors.text, lineHeight: 1.6}}>{children}</span>
        </div>
    );
}

const eyebrowStyle: React.CSSProperties = {
    fontSize: 10,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: tokens.colors.textFaint,
    fontWeight: 700,
};

const ghostBtn: React.CSSProperties = {
    padding: '7px 16px',
    border: 'none',
    borderRadius: RADIUS.pill,
    background: tokens.colors.bgAlt,
    color: tokens.colors.accent,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.01em',
    cursor: 'pointer',
};
