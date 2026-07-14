#!/usr/bin/env python3
"""
Generate ready-to-import sample CSVs for the Feature Management Pipeline Tracker
(the 5-table, Attributes-centric model). SYNTHETIC demo data — not a real backlog.

Run:  python3 generate.py     # writes Teams/Features/Stages/Attributes/Handshakes .csv here

Field/option names match frontend/constants.js VERBATIM. Tweak the data structures
below and re-run to expand the dataset.
"""
import csv
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

# ── Teams (teams AND their users) ─────────────────────────────────────────────
TEAMS = [
    ("Accounting / Reporting COE (Control Crew)", ["Priya Anand", "Marco Reuter"], "Control", "Excel, DRA", "coe@bankdemo.internal"),
    ("Data & AI Modelling Crew", ["Lena Hofmann", "Tomás Silva"], "Data & AI", "DRA, Enterprise Architect", "modelling@bankdemo.internal"),
    ("Data & AI Gateway Crew", ["Ravi Menon", "Sofia Costa"], "Data & AI", "ampliFi gateway", "gateway@bankdemo.internal"),
    ("Data & AI Feed-agnostic Crew", ["Jan Vermeer", "Aisha Khan"], "Data & AI", "ASD tenant", "feedagnostic@bankdemo.internal"),
    ("Data & AI System 1 Sourcing Crew (MOR)", ["Kenji Tan", "Olga Petrova"], "Data & AI", "ACD tenant", "mor@bankdemo.internal"),
    ("Data & AI System 2 Sourcing Crew (MIDAS)", ["David Okoro", "Mei Lin"], "Data & AI", "ARD tenant", "midas@bankdemo.internal"),
    ("Data & AI Ref Data Sourcing Crew", ["Hugo Bernard", "Sara Galli"], "Data & AI", "ASD tenant", "refdata@bankdemo.internal"),
    ("FPSL/GL/GR Crew (Control)", ["Anita Desai", "Lukas Brandt"], "Calculate", "SAP / Fioneer", "fpsl@bankdemo.internal"),
    ("Calculate Crew", ["Yuki Mori", "Pawel Nowak"], "Calculate", "SAP / Fioneer", "calculate@bankdemo.internal"),
    ("Report Crew", ["Clara Vogt", "Sam Ito"], "Report", "ARD tenant", "report@bankdemo.internal"),
]
COE = TEAMS[0][0]
MOD = TEAMS[1][0]
GTW = TEAMS[2][0]
FAG = TEAMS[3][0]
MOR = TEAMS[4][0]
MID = TEAMS[5][0]
REF = TEAMS[6][0]
FPSL = TEAMS[7][0]
CALC = TEAMS[8][0]
RPT = TEAMS[9][0]

# ── Stages (thin reference ladder) ────────────────────────────────────────────
# name, code, order, phase, responsible, approver
STAGES = [
    ("1. Business Requirements", "1", 1, "Requirements", COE, COE),
    ("2. Posting Model Specifications / Data Requirements", "2", 2, "Requirements", COE, MOD),
    ("3. Data Modelling", "3", 3, "Modelling", MOD, GTW),
    ("4. Gateway Derivation", "4", 4, "Transformation", GTW, FAG),
    ("5a. System / Feed-agnostic Sourcing", "5a", 5, "Sourcing", FAG, FPSL),
    ("5b. MOR (Upstream System 1) Sourcing & VESTing", "5b-MOR", 6, "Sourcing", MOR, FPSL),
    ("5b. MIDAS (Upstream System 2) Sourcing & VESTing", "5b-MIDAS", 7, "Sourcing", MID, FPSL),
    ("5b. Other Systems Sourcing & VESTing", "5b-Other", 8, "Sourcing", MID, FPSL),
    ("5c. Static / Reference Data Source Systems", "5c", 9, "Sourcing", REF, FPSL),
    ("6. FPSL Config", "6", 10, "Sub-ledger", FPSL, FPSL),
    ("7. GL", "7", 11, "Sub-ledger", FPSL, FPSL),
    ("8. GR", "8", 12, "Sub-ledger", FPSL, CALC),
    ("9. Calculator Build", "9", 13, "Calculate", CALC, RPT),
    ("10. Report Build", "10", 14, "Report", RPT, ""),
]
STAGE_BY_CODE = {s[1]: s for s in STAGES}
STAGE_NAME = {s[1]: s[0] for s in STAGES}
STAGE_RESP = {s[1]: s[4] for s in STAGES}
STAGE_APPR = {s[1]: s[5] for s in STAGES}

# ── Features (Entity + Initiative are flat fields on the feature) ─────────────
# name, entity, initiative, owning team, status, priority, go-live, KDO
FEATURES = [
    ("Loans Disbursement", "UBS Switzerland AG", "Balance Sheet Go-Live", COE, "In Progress", "Critical", "2026-07-25", "Daily loan disbursement postings feeding the sub-ledger and liquidity reports."),
    ("Customer Deposits", "UBS Switzerland AG", "Balance Sheet Go-Live", COE, "Blocked", "High", "2026-07-26", "Customer deposit balances and accrued interest for sub-ledger and balance-sheet reporting."),
    ("Securities Holdings", "UBS Switzerland AG", "Balance Sheet Go-Live", COE, "In Progress", "High", "2026-07-31", "Securities positions and valuations sourced for sub-ledger posting and disclosure."),
    ("Interest Rate Swaps", "UBS AG", "Treasury & Markets", COE, "In Progress", "Critical", "2026-08-01", "IRS lifecycle events and valuations posted through FPSL into GL/GR and risk reporting."),
    ("FX Spot & Forward", "UBS AG", "Treasury & Markets", COE, "In Progress", "Medium", "2026-10-16", "FX spot/forward capture, revaluation and posting for treasury and balance-sheet reporting."),
    ("Repurchase Agreements", "UBS AG", "Treasury & Markets", COE, "In Progress", "Medium", "2026-09-04", "Repo cash legs and collateral postings for liquidity and balance-sheet reporting."),
]

# Acceptance-criteria templates per phase (kept short for the demo).
def ac(items):
    return json.dumps([{"text": t, "done": d} for t, d in items])

# ── Attributes = the work items (one row each) ────────────────────────────────
# id, business, technical, fsdm, feature, sourcing type, is_ref(bool), gateway(bool),
# stage code, status, assignee, approval status, acceptance(list of (text,done)),
# environment, due, blocked reason, comments
ATTRS = [
    # Loans Disbursement — near delivered
    ("LD-01", "Financial contract ID", "SOURCE_FINANCIAL_CONTRACT_ID", "FINANCIAL_CONTRACT_ID", "Loans Disbursement", "Feed-specific (MOR)", False, False,
     "10", "Done", "Clara Vogt", "Approved",
     [("Report layout built", True), ("Figures reconciled to GR/GL", True), ("Business owner UAT sign-off", True)], "N/A", "2026-07-20", "", ""),
    ("LD-02", "Transaction amount", "TRANSACTION_AMOUNT", "TRANSACTION_AMOUNT", "Loans Disbursement", "Feed-specific (MIDAS)", False, False,
     "9", "In Progress", "Yuki Mori", "Not Required",
     [("Calculator logic built", True), ("Calc output validated", True)], "N/A", "2026-07-02", "", "Ready for report build."),
    ("LD-03", "Product type", "FSDM_PRODUCT_TYPE", "PRODUCT_TYPE", "Loans Disbursement", "Reference Data", True, False,
     "5c", "Done", "Hugo Bernard", "Approved",
     [("Golden source identified", True), ("Reference set version-pinned", True), ("Lookup integrity validated", True)], "PROD", "2026-06-25", "", ""),

    # Customer Deposits — mid, with a blocker and an approval-in-flight
    ("CD-01", "Counterparty ID", "SOURCE_COUNTERPARTY_ID", "COUNTERPARTY_ID", "Customer Deposits", "Reference Data", True, False,
     "3", "Blocked", "Lena Hofmann", "Not Required",
     [("Logical model updated in EA", True), ("FSDM mapping confirmed", False), ("Peer review passed", False)], "N/A", "2026-06-28", "Gateway derivation rule conflicts with FSDM mapping — escalated to Modelling.", ""),
    ("CD-02", "Transaction amount", "TRANSACTION_AMOUNT", "TRANSACTION_AMOUNT", "Customer Deposits", "Feed-specific (MIDAS)", False, False,
     "6", "Submitted for Review", "Anita Desai", "Pending",
     [("FPSL posting key configured", True), ("Sub-ledger posting simulated", True)], "N/A", "2026-07-05", "", "Awaiting Control sign-off."),
    ("CD-03", "Posting date", "POSTING_DATE", "POSTING_DATE", "Customer Deposits", "Feed-agnostic", False, False,
     "5a", "In Progress", "Aisha Khan", "Not Required",
     [("Feed-agnostic source mapped", True), ("VEST checks pass", False), ("Row counts reconciled", False)], "UAT", "2026-07-08", "", ""),

    # Securities Holdings — early-mid
    ("SH-01", "Financial contract ID", "SOURCE_FINANCIAL_CONTRACT_ID", "FINANCIAL_CONTRACT_ID", "Securities Holdings", "Feed-specific (MOR)", False, False,
     "3", "In Progress", "Tomás Silva", "Not Required",
     [("Logical model updated in EA", True), ("FSDM mapping confirmed", True), ("Peer review passed", False)], "N/A", "2026-07-07", "", ""),
    ("SH-02", "Position currency", "POSITION_CURRENCY", "POSITION_CURRENCY", "Securities Holdings", "Feed-agnostic", False, True,
     "4", "In Progress", "Sofia Costa", "Not Required",
     [("Derivation rule defined", True), ("Unit-tested vs sample feed", True), ("Logic documented", False)], "N/A", "2026-06-30", "", ""),
    ("SH-03", "Counterparty type", "SOURCE_COUNTERPARTY_ID_TYPE", "COUNTERPARTY_ID_TYPE", "Securities Holdings", "Reference Data", True, False,
     "2", "Not Started", "", "Not Required",
     [("Posting model spec drafted", False), ("Data requirements complete", False)], "N/A", "2026-07-14", "", ""),

    # Interest Rate Swaps — mid, an approval + a ready-to-push + a blocker
    ("IRS-01", "Financial contract ID", "SOURCE_FINANCIAL_CONTRACT_ID", "FINANCIAL_CONTRACT_ID", "Interest Rate Swaps", "Feed-specific (MOR)", False, False,
     "7", "Submitted for Review", "Anita Desai", "Pending",
     [("GL account assignment confirmed", True), ("GL posting reconciled", True)], "N/A", "2026-07-02", "", ""),
    ("IRS-02", "Transaction amount", "TRANSACTION_AMOUNT", "TRANSACTION_AMOUNT", "Interest Rate Swaps", "Feed-specific (MIDAS)", False, False,
     "8", "Approved", "Lukas Brandt", "Approved",
     [("GR reconciliation rule configured", True), ("GR balances tie out", True)], "N/A", "2026-06-29", "", "Approved — ready for calculator build."),
    ("IRS-03", "Settlement ID", "SETTLEMENT_ID", "SETTLEMENT_ID", "Interest Rate Swaps", "Feed-specific (MIDAS)", False, False,
     "6", "Blocked", "Lukas Brandt", "Not Required",
     [("FPSL posting key configured", True), ("Sub-ledger posting simulated", False)], "N/A", "2026-07-07", "MOR feed field not yet exposed in DEV — raised with sourcing crew.", ""),

    # FX Spot & Forward — early, an approval-in-flight
    ("FX-01", "Posting date", "POSTING_DATE", "POSTING_DATE", "FX Spot & Forward", "Feed-agnostic", False, False,
     "3", "Submitted for Review", "Lena Hofmann", "Pending",
     [("Logical model updated in EA", True), ("FSDM mapping confirmed", True), ("Peer review passed", True)], "N/A", "2026-07-07", "", ""),
    ("FX-02", "Transaction amount", "TRANSACTION_AMOUNT", "TRANSACTION_AMOUNT", "FX Spot & Forward", "Feed-specific (MIDAS)", False, False,
     "2", "In Progress", "Marco Reuter", "Not Required",
     [("Posting model spec drafted", True), ("Data requirements complete", False)], "N/A", "2026-07-10", "", ""),

    # Repurchase Agreements — just starting, one ready to push
    ("REPO-01", "Financial contract ID", "SOURCE_FINANCIAL_CONTRACT_ID", "FINANCIAL_CONTRACT_ID", "Repurchase Agreements", "Feed-specific (MOR)", False, False,
     "1", "In Progress", "Marco Reuter", "Not Required",
     [("Business outcome / KDO signed off", True), ("Scope boundaries agreed", True)], "N/A", "2026-06-27", "", "Requirements complete — ready to push to modelling."),
    ("REPO-02", "Posting date", "POSTING_DATE", "POSTING_DATE", "Repurchase Agreements", "Feed-agnostic", False, False,
     "1", "Not Started", "", "Not Required",
     [("Business outcome / KDO signed off", False), ("Scope boundaries agreed", False)], "N/A", "2026-06-29", "", ""),
]

# ── Attribute → Attribute relationships (self-links) ──────────────────────────
# ADDRESSED_BY: this attribute is resolved / satisfied by the listed attributes.
# FORKS_INTO:   this attribute spawns / branches into the listed attributes.
ADDRESSED_BY = {
    "IRS-03": ["SH-01"],           # the blocked settlement id is addressed by the MOR contract id work
    "CD-01": ["LD-03"],            # counterparty ref data addressed by the delivered product-type ref set
}
FORKS_INTO = {
    "LD-01": ["LD-02", "LD-03"],   # the contract id forks into amount + product type
    "IRS-01": ["IRS-02", "IRS-03"],
    "CD-02": ["CD-03"],
}

# ── Handshakes (audit log) ────────────────────────────────────────────────────
# attr id, feature, stage code, from team, to team, action, decision maker, ts, comment, cycle
HANDSHAKES = [
    ("LD-01", "Loans Disbursement", "9", CALC, RPT, "Approved", "Clara Vogt", "2026-06-18", "Calc validated; handed to Report.", 1),
    ("LD-01", "Loans Disbursement", "10", RPT, "", "Approved", "Clara Vogt", "2026-06-24", "Report signed off — delivered.", 1),
    ("LD-02", "Loans Disbursement", "8", FPSL, CALC, "Approved", "Pawel Nowak", "2026-06-20", "GR balances tie out.", 1),
    ("LD-03", "Loans Disbursement", "5c", REF, FPSL, "Approved", "Anita Desai", "2026-06-25", "Reference set version-pinned.", 1),
    ("CD-01", "Customer Deposits", "2", MOD, COE, "Rejected / Returned", "Lena Hofmann", "2026-06-22", "FSDM mapping inconsistent — returned.", 2),
    ("CD-02", "Customer Deposits", "5b-MIDAS", MID, FPSL, "Approved", "Lukas Brandt", "2026-06-26", "MIDAS reconciliation signed off.", 1),
    ("IRS-01", "Interest Rate Swaps", "6", FPSL, FPSL, "Approved", "Anita Desai", "2026-06-23", "Posting key configured.", 1),
    ("IRS-02", "Interest Rate Swaps", "7", FPSL, FPSL, "Approved", "Lukas Brandt", "2026-06-27", "GL reconciled.", 1),
    ("FX-01", "FX Spot & Forward", "2", COE, MOD, "Approved", "Tomás Silva", "2026-06-24", "Data requirements complete.", 1),
    ("REPO-01", "Repurchase Agreements", "1", COE, COE, "Approved", "Marco Reuter", "2026-06-25", "Requirements signed off.", 1),
]

SOURCING_CODES = {"5a", "5b-MOR", "5b-MIDAS", "5b-Other", "5c"}


def checkbox(v):
    # text→checkbox conversion in Airtable treats non-empty as checked.
    return "checked" if v else ""


def write_csv(name, header, rows):
    path = os.path.join(HERE, name)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        w.writerow(header)
        w.writerows(rows)
    print(f"wrote {name}: {len(rows)} rows")


def main():
    write_csv("Teams.csv",
              ["Team Name", "Users", "Domain", "Tool / Environment", "Email"],
              [[n, ", ".join(u), d, t, e] for (n, u, d, t, e) in TEAMS])

    write_csv("Stages.csv",
              ["Stage Name", "Stage Code", "Order", "Phase Group", "Responsible Team", "Approver Team"],
              [[n, c, o, p, r, a] for (n, c, o, p, r, a) in STAGES])

    write_csv("Features.csv",
              ["Feature Name", "Entity", "Initiative", "Owning Team", "Status", "Priority",
               "Target Go-Live Date", "Business Outcome / KDO Description"],
              [list(f) for f in FEATURES])

    attr_rows = []
    for (aid, biz, tech, fsdm, feat, srt, isref, gw, code, status, assignee, appr,
         acc, env, due, blocked, comments) in ATTRS:
        environment = env if code in SOURCING_CODES else "N/A"
        attr_rows.append([
            aid, biz, tech, fsdm, feat, srt,
            checkbox(isref), checkbox(gw),
            STAGE_NAME[code], status, assignee,
            STAGE_RESP[code], STAGE_APPR[code], appr,
            ac(acc), checkbox(all(d for _, d in acc)),
            environment, "", "", due, blocked, comments, "",
            ", ".join(ADDRESSED_BY.get(aid, [])), ", ".join(FORKS_INTO.get(aid, [])),
        ])
    write_csv("Attributes.csv",
              ["Attribute ID", "Business Name", "Technical Name", "FSDM Mapping", "Feature",
               "Sourcing Type", "Is Reference Data", "Requires Gateway Derivation",
               "Current Stage", "Status", "Assignee", "Assigned Team", "Approver Team",
               "Approval Status", "Acceptance Criteria", "Acceptance Met?", "Environment",
               "Started Date", "Completed Date", "Due Date", "Blocked Reason",
               "Comments / Handoff Notes", "Cycle Number", "Addressed By", "Forks Into"],
              attr_rows)

    hs_rows = []
    for i, (aid, feat, code, frm, to, action, dm, ts, comment, cyc) in enumerate(HANDSHAKES, 1):
        hs_rows.append([f"HS-{i:04d}", aid, feat, STAGE_NAME[code], frm, to, action, dm, ts, comment, cyc])
    write_csv("Handshakes.csv",
              ["Handshake ID", "Attribute", "Feature", "Stage", "From Team", "To Team",
               "Action", "Decision Maker", "Timestamp", "Comments", "Cycle Number"],
              hs_rows)


if __name__ == "__main__":
    main()
