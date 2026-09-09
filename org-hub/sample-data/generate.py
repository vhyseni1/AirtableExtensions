#!/usr/bin/env python3
"""Generate the Org Hub sample data set.

Writes two CSVs that mirror the field names the extension reads (see
`frontend/config.js`):

  * ``Employees & Positions.csv``       — one row per position (filled or vacant)
  * ``Supervisory Organizations.csv``   — one row per supervisory organization
  * ``Org Design Data.csv``             — the flat, pre-aggregated table the
    stacked deck reads: one row per (slide, level, org, position, side)
  * ``Org Design Notes.csv``            — per-slide subtitle and commentary

The two files are internally consistent: every person sits in a supervisory
organization that exists, every manager reference resolves, the headcount
rollup on each supervisory org equals the FTE of its direct members, and the
short codes are hierarchical (a ``DSG`` leader's subtree is exactly the rows
whose Short Code starts with ``DSG``).

The org-design table is derived from the same people, so its CURRENT headcount
reconciles with the people table position for position; the FUTURE side applies
the restructuring scenario in ``SCENARIO`` below.

Deterministic — ``random`` is seeded, so re-running produces the same data.

Usage:  python3 generate.py
"""

import csv
import os
import random
import zlib
from datetime import date, timedelta

random.seed(20260909)

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# ─── Supervisory organization skeleton ───────────────────────────────────────
#
# (short_code, org name, parent short code, SO status, scoping, headcount target)
# The root's parent is None. Short codes are hierarchical by construction: a
# child's code always starts with its parent's code.

ORG_TREE = [
    # code,     name,                       parent,  SO status,          scoping,        ICs
    ("EX",      "Executive Office",          None,    "No Changes SO",    "In Scope",     3),
    ("DSG",     "Digital Solutions Group",   "EX",    "Updated SO",       "In Scope",     4),
    ("DSGA",    "Data & Analytics",          "DSG",   "Updated SO",       "In Scope",     3),
    ("DSGAE",   "Data Engineering",          "DSGA",  "New SO",           "In Scope",     8),
    ("DSGAI",   "Analytics & Insights",      "DSGA",  "New SO",           "In Scope",     7),
    ("DSGP",    "Platform Engineering",      "DSG",   "No Changes SO",    "In Scope",     3),
    ("DSGPC",   "Cloud Infrastructure",      "DSGP",  "No Changes SO",    "In Scope",     6),
    ("DSGPA",   "Application Services",      "DSGP",  "Updated SO",       "In Scope",     9),
    ("DSGD",    "Digital Product",           "DSG",   "New SO - Draft",   "In Scope",     6),
    ("FIN",     "Finance",                   "EX",    "No Changes SO",    "Out of Scope", 3),
    ("FINC",    "Controlling",               "FIN",   "No Changes SO",    "Out of Scope", 6),
    ("FINT",    "Treasury & Tax",            "FIN",   "Decommissioned SO", "Out of Scope", 4),
    ("HR",      "People & Culture",          "EX",    "Updated SO",       "In Scope",     3),
    ("HRTA",    "Talent Acquisition",        "HR",    "New SO - Draft",   "In Scope",     5),
    ("HROP",    "HR Operations",             "HR",    "No Changes SO",    "In Scope",     6),
    ("COM",     "Commercial",                "EX",    "No Changes SO",    "Out of Scope", 2),
    ("COMSE",   "Sales EMEA",                "COM",   "No Changes SO",    "Out of Scope", 9),
    ("COMMK",   "Marketing",                 "COM",   "Updated SO",       "Out of Scope", 5),
    ("OPS",     "Operations",                "EX",    "No Changes SO",    "In Scope",     2),
    ("OPSSC",   "Supply Chain",              "OPS",   "No Changes SO",    "In Scope",     8),
    ("OPSQC",   "Quality & Compliance",      "OPS",   "New SO",           "In Scope",     6),
    ("RND",     "Research & Development",    "EX",    "No Changes SO",    "In Scope",     2),
    ("RNDCD",   "Clinical Development",      "RND",   "Updated SO",       "In Scope",     9),
    ("RNDPR",   "Preclinical Research",      "RND",   "No Changes SO",    "In Scope",     7),
]

# Top-level organization each code rolls up to (used by the "Organization" filter).
TOP_LEVEL = {
    "EX": "Executive Office",
    "DSG": "Digital Solutions Group",
    "FIN": "Finance",
    "HR": "People & Culture",
    "COM": "Commercial",
    "OPS": "Operations",
    "RND": "Research & Development",
}

# Leader title per org code.
LEADER_TITLE = {
    "EX": "Chief Executive Officer",
    "DSG": "Chief Digital Officer",
    "DSGA": "Head of Data & Analytics",
    "DSGAE": "Data Engineering Manager",
    "DSGAI": "Analytics Manager",
    "DSGP": "Head of Platform Engineering",
    "DSGPC": "Cloud Infrastructure Manager",
    "DSGPA": "Application Services Manager",
    "DSGD": "Head of Digital Product",
    "FIN": "Chief Financial Officer",
    "FINC": "Head of Controlling",
    "FINT": "Head of Treasury & Tax",
    "HR": "Chief People Officer",
    "HRTA": "Head of Talent Acquisition",
    "HROP": "Head of HR Operations",
    "COM": "Chief Commercial Officer",
    "COMSE": "Sales Director EMEA",
    "COMMK": "Marketing Director",
    "OPS": "Chief Operating Officer",
    "OPSSC": "Head of Supply Chain",
    "OPSQC": "Head of Quality & Compliance",
    "RND": "Chief Scientific Officer",
    "RNDCD": "Head of Clinical Development",
    "RNDPR": "Head of Preclinical Research",
}

# Individual-contributor titles per org code (cycled).
IC_TITLES = {
    "EX": ["Executive Assistant", "Chief of Staff", "Board Secretary"],
    "DSG": ["Digital Portfolio Lead", "Digital Transformation Manager", "Business Partner", "PMO Analyst"],
    "DSGA": ["Data Governance Lead", "Data Steward", "Master Data Analyst"],
    "DSGAE": ["Data Engineer", "Senior Data Engineer", "Analytics Engineer", "Platform Data Engineer"],
    "DSGAI": ["Business Intelligence Analyst", "Data Scientist", "Reporting Analyst", "Insights Manager"],
    "DSGP": ["Enterprise Architect", "Platform Product Owner", "Technical Program Manager"],
    "DSGPC": ["Cloud Engineer", "Site Reliability Engineer", "Network Engineer", "DevOps Engineer"],
    "DSGPA": ["Application Engineer", "Integration Engineer", "SAP Specialist", "Salesforce Administrator"],
    "DSGD": ["Product Manager", "UX Designer", "Front-end Engineer", "Product Analyst"],
    "FIN": ["Finance Business Partner", "Financial Planning Manager", "Investor Relations Manager"],
    "FINC": ["Controller", "Cost Accountant", "Financial Analyst", "Reporting Accountant"],
    "FINT": ["Treasury Analyst", "Tax Specialist", "Cash Manager", "Compliance Accountant"],
    "HR": ["HR Business Partner", "Organisational Design Lead", "Reward Manager"],
    "HRTA": ["Recruiter", "Sourcing Specialist", "Talent Partner", "Employer Brand Manager"],
    "HROP": ["HR Operations Specialist", "Payroll Specialist", "HRIS Analyst", "People Data Analyst"],
    "COM": ["Commercial Excellence Manager", "Pricing Manager"],
    "COMSE": ["Account Manager", "Key Account Manager", "Sales Specialist", "Inside Sales Representative"],
    "COMMK": ["Brand Manager", "Digital Marketing Manager", "Content Specialist", "Campaign Manager"],
    "OPS": ["Operations Excellence Lead", "Business Continuity Manager"],
    "OPSSC": ["Supply Planner", "Demand Planner", "Logistics Coordinator", "Procurement Specialist"],
    "OPSQC": ["Quality Engineer", "QA Specialist", "Compliance Officer", "Validation Engineer"],
    "RND": ["Scientific Program Manager", "R&D Portfolio Analyst"],
    "RNDCD": ["Clinical Trial Manager", "Clinical Research Associate", "Biostatistician", "Medical Writer"],
    "RNDPR": ["Research Scientist", "Laboratory Technician", "Bioinformatician", "Study Director"],
}

JOB_FAMILY = {
    "EX": "General Management", "DSG": "General Management", "DSGA": "Data",
    "DSGAE": "Data", "DSGAI": "Data", "DSGP": "Technology", "DSGPC": "Technology",
    "DSGPA": "Technology", "DSGD": "Product", "FIN": "Finance", "FINC": "Finance",
    "FINT": "Finance", "HR": "Human Resources", "HRTA": "Human Resources",
    "HROP": "Human Resources", "COM": "Commercial", "COMSE": "Commercial",
    "COMMK": "Marketing", "OPS": "Operations", "OPSSC": "Operations",
    "OPSQC": "Quality", "RND": "Research", "RNDCD": "Research", "RNDPR": "Research",
}

LOCATIONS = ["Basel", "Zurich", "Lausanne", "Berlin", "Barcelona", "Dublin", "Warsaw", "Singapore"]
LOCATION_WEIGHTS = [30, 18, 8, 12, 8, 8, 10, 6]

EMPLOYMENT_TYPES = ["Permanent", "Fixed-term", "Contractor"]
EMPLOYMENT_WEIGHTS = [82, 8, 10]

DECISIONS = ["Retain", "Transfer", "Redeploy", "Exit", "To be confirmed"]
DECISION_WEIGHTS = [62, 13, 10, 6, 9]

GRADES = ["G5", "G6", "G7", "G8", "G9", "G10", "G11", "G12"]

FIRST_NAMES = [
    "Marta", "Daniel", "Priya", "Tomas", "Lena", "Ahmed", "Sofia", "Robert", "Aisha",
    "Lucas", "Hannah", "Viktor", "Elena", "Jonas", "Nadia", "Pierre", "Ingrid", "Mateo",
    "Yuki", "Claire", "Andreas", "Fatima", "Oliver", "Isabelle", "Nikolai", "Chiara",
    "Samuel", "Rania", "Felix", "Anouk", "Miguel", "Katarina", "Ravi", "Emilie", "Stefan",
    "Leila", "Gustav", "Maja", "Hassan", "Julia", "Marco", "Sanne", "Peter", "Zara",
    "Nils", "Camille", "Dimitri", "Alina", "Georg", "Noor", "Bruno", "Silke", "Ivan",
    "Marie", "Anders", "Rosa", "Karim", "Astrid", "Pablo", "Freya", "Aleksander",
    "Beatrice", "Youssef", "Helena", "Tobias", "Lucia", "Mikkel", "Sara", "Janos",
    "Nina", "Theo", "Amara", "Vincent", "Ida", "Rafael", "Petra", "Simon", "Alma",
    "Erik", "Dalia", "Christoph", "Mira", "Bastien", "Greta", "Omar", "Louise",
    "Henrik", "Yasmin", "Julien", "Anja", "Diego", "Eva", "Kasper", "Nour", "Matteo",
    "Solveig", "Thomas", "Rania", "Adrian", "Lotte", "Sven", "Meera", "Bernard", "Kira",
    "Filip", "Naomi", "Arne", "Clara", "Rasmus", "Delphine", "Milan", "Agnes", "Hugo",
    "Selma", "Victor", "Nadine", "Emil", "Rita", "Jasper", "Tanja", "Leon", "Vera",
    "Manuel", "Elsa", "Pascal", "Roxana", "Anton", "Hilde", "Cedric", "Bianca",
]

LAST_NAMES = [
    "Kovacs", "Ferreira", "Raman", "Novak", "Fischer", "Haddad", "Marino", "Klein",
    "Bello", "Moreau", "Berg", "Sorensen", "Vasquez", "Lindqvist", "Okafor", "Dubois",
    "Andersen", "Rossi", "Tanaka", "Laurent", "Weber", "El-Amin", "Wright", "Girard",
    "Petrov", "Conti", "Larsen", "Haddadi", "Brandt", "Visser", "Alvarez", "Horvath",
    "Iyer", "Bernard", "Muller", "Nasser", "Lindberg", "Kowalski", "Osei", "Schneider",
    "Bianchi", "De Vries", "Novotny", "Ahmed", "Bergstrom", "Renaud", "Sokolov",
    "Kaufmann", "Farkas", "Rahman", "Costa", "Hoffmann", "Ilic", "Leclerc", "Nilsson",
    "Delgado", "Zoubir", "Lindholm", "Serrano", "Aaltonen", "Marchetti", "Nowak",
    "Baptiste", "Vogel", "Karlsen", "Moretti", "Szabo", "Ivanova", "Reinhart",
    "Achterberg", "Duarte", "Bauer", "Solberg", "Mancini", "Krause", "Beaumont",
    "Thorsen", "Falk", "Guerrero", "Steiner", "Lombardi", "Jonsson", "Chevalier",
    "Winkler", "Amrani", "Sundberg", "Bergman", "Dumont", "Frei", "Salvatore",
    "Halvorsen", "Roussel", "Meyer", "Barros", "Lindgren", "Perrin", "Zimmermann",
    "Kristensen", "Fontaine", "Aubert", "Holm", "Marchand", "Rieger", "Sandoval",
    "Vuillemin", "Eriksen", "Baumgartner", "Colombo", "Rasmussen", "Tremblay",
    "Wolff", "Sarr", "Berger", "Naderi", "Lund", "Pereira", "Graf", "Toth", "Blom",
    "Keller", "Rojas", "Aebi", "Michel", "Strand", "Gasser", "Prieto", "Wenger",
]

COMPANY_DOMAIN = "aurorahealth.example"
COMPANY_NAME = "Aurora Health Group"

# Location → ISO-3 code, for the country chips on a slot.
LOCATION_ISO = {
    "Basel": "CHE", "Zurich": "CHE", "Lausanne": "CHE", "Berlin": "DEU",
    "Barcelona": "ESP", "Dublin": "IRL", "Warsaw": "POL", "Singapore": "SGP",
}

# ─── Restructuring scenario (the FUTURE side of the deck) ────────────────────
#
# Per supervisory org:
#   "new"       [(position title, headcount)] — posted roles that don't exist today
#   "at_risk"   {position title: headcount removed}
#   "selection" [position titles] — populations going through a selection process
#
# Everything not named here is mapped one-to-one and shows as "no change".
# Vacancies already in the people table are emitted as posted roles automatically.

SCENARIO = {
    "DSGAE": {"new": [("Streaming Data Engineer", 3), ("Data Reliability Engineer", 2)],
              "selection": ["Data Engineer"]},
    "DSGAI": {"new": [("Machine Learning Engineer", 2)],
              "selection": ["Reporting Analyst"]},
    "DSGPC": {"new": [("Platform Security Engineer", 2)],
              "at_risk": {"Network Engineer": 2}},
    "DSGPA": {"at_risk": {"SAP Specialist": 3, "Integration Engineer": 2},
              "selection": ["Application Engineer"]},
    "DSGD":  {"new": [("Design Systems Lead", 1), ("Product Analyst", 2)]},
    "FINC":  {"at_risk": {"Cost Accountant": 2}},
    "FINT":  {"at_risk": {"Treasury Analyst": 2, "Tax Specialist": 1, "Cash Manager": 1,
                          "Compliance Accountant": 1, "Head of Treasury & Tax": 1}},
    "HRTA":  {"at_risk": {"Sourcing Specialist": 2}, "new": [("Talent Intelligence Analyst", 1)]},
    "HROP":  {"new": [("People Analytics Engineer", 2)],
              "at_risk": {"Payroll Specialist": 2}},
    "COMSE": {"selection": ["Account Manager", "Inside Sales Representative"]},
    "COMMK": {"new": [("Marketing Automation Specialist", 1)]},
    "OPSSC": {"new": [("Supply Chain Data Analyst", 2)],
              "at_risk": {"Logistics Coordinator": 2}},
    "OPSQC": {"new": [("Computer System Validation Engineer", 2)]},
    "RNDCD": {"new": [("Decentralised Trials Manager", 2)],
              "selection": ["Clinical Research Associate"]},
    "RNDPR": {"at_risk": {"Laboratory Technician": 3}},
}

# Per-slide commentary shown in the notes band.
SLIDE_NOTES = {
    "Digital Solutions Group": (
        "Consolidating data and platform engineering into two centres of excellence",
        "SAP and integration roles move to the managed-service partner\n"
        "Network engineering consolidates into the cloud platform team\n"
        "Application engineering population enters a selection process",
        "Build a single data and platform backbone for the group\n"
        "Shift from project delivery to product ownership",
    ),
    "Finance": (
        "Treasury and tax move to the group shared-service centre",
        "Treasury & Tax is decommissioned as a standalone organisation\n"
        "Controlling reduces duplicate cost-accounting roles",
        "Concentrate transactional finance in the shared-service centre\n"
        "Keep business partnering close to the functions",
    ),
    "People & Culture": (
        "Rebalancing from sourcing capacity to people analytics",
        "Sourcing specialist roles reduce as hiring volumes normalise\n"
        "Payroll administration moves to the shared-service centre",
        "Invest in people data and talent intelligence",
    ),
    "Operations": (
        "Digitising supply-chain planning and quality validation",
        "Logistics coordination is partly automated\n"
        "New validation engineering capacity for the quality system",
        "Move from manual coordination to planning analytics",
    ),
    "Research & Development": (
        "Shifting laboratory capacity towards decentralised trials",
        "Laboratory technician roles reduce with automation\n"
        "New decentralised-trial management capability",
        "Run more trials remotely, closer to patients",
    ),
    "Commercial": (
        "Field organisation unchanged; marketing gains automation capability",
        "Account management and inside sales enter a selection process",
        "Sharpen digital campaign execution",
    ),
    "Executive Office": (
        "No structural change",
        "",
        "Maintain a lean corporate centre",
    ),
    # DLT-2 detail slides — the drill-down a leader gets for their own branch.
    "Data & Analytics": (
        "Engineering capacity grows; reporting moves to self-service",
        "Data engineering population enters a selection process\n"
        "Reporting analysts reskill towards self-service enablement",
        "One data platform serving every function\n"
        "Analysts spend their time on questions, not on extracts",
    ),
    "Platform Engineering": (
        "Network operations consolidate into the cloud platform team",
        "Network engineering roles reduce as the estate moves to cloud\n"
        "SAP and integration work moves to a managed-service partner\n"
        "Application engineering population enters a selection process",
        "Run one platform, not five\n"
        "Buy the commodity, build the differentiator",
    ),
}


def unique_names(count):
    """Draw `count` distinct full names."""
    seen, out = set(), []
    while len(out) < count:
        name = "%s %s" % (random.choice(FIRST_NAMES), random.choice(LAST_NAMES))
        if name in seen:
            continue
        seen.add(name)
        out.append(name)
    return out


def email_for(full_name, taken):
    first, last = full_name.split(" ", 1)
    slug = ("%s.%s" % (first, last)).lower()
    for ch in " '-":
        slug = slug.replace(ch, "")
    candidate = "%s@%s" % (slug, COMPANY_DOMAIN)
    n = 2
    while candidate in taken:
        candidate = "%s%d@%s" % (slug, n, COMPANY_DOMAIN)
        n += 1
    taken.add(candidate)
    return candidate


def top_level_for(code):
    for prefix in sorted(TOP_LEVEL, key=len, reverse=True):
        if code.startswith(prefix):
            return TOP_LEVEL[prefix]
    return "Unassigned"


def main():
    org_by_code = {row[0]: row for row in ORG_TREE}
    total_people = sum(row[5] for row in ORG_TREE) + len(ORG_TREE)
    name_pool = unique_names(total_people)
    name_iter = iter(name_pool)
    emails_taken = set()

    # Positions that are deliberately left vacant. One of them (DSGAI) is a
    # *manager* seat, which exercises the "vacant leader" rendering path.
    vacant_leader_codes = {"DSGAI"}
    vacant_ic_slots = {("DSGAE", 2), ("DSGPA", 5), ("COMSE", 3), ("OPSSC", 6),
                       ("RNDCD", 8), ("HROP", 1), ("FINC", 4), ("DSGD", 0)}

    people = []          # dicts, in output order
    leader_by_code = {}  # org code → person dict
    pos_seq = 0
    emp_seq = 1000
    req_seq = 0
    start_pool_start = date(2012, 1, 9)

    def next_position_id():
        nonlocal pos_seq
        pos_seq += 1
        return "POS-%04d" % pos_seq

    def make_person(code, title, is_leader, vacant):
        nonlocal emp_seq, req_seq
        position_id = next_position_id()
        if vacant:
            req_seq += 1
            worker_id = "REQ-%04d" % req_seq
            full_name, email = "", ""
        else:
            emp_seq += 1
            worker_id = "E-%d" % emp_seq
            full_name = next(name_iter)
            email = email_for(full_name, emails_taken)
        start = start_pool_start + timedelta(days=random.randint(0, 4900))
        return {
            "Position ID": position_id,
            "[E] Employee ID": worker_id,
            "[E] First Name, Last Name": full_name,
            "REF Title [F]": title,
            "[F] Supervisory Organization 🔗": "",   # filled once SO names exist
            "Future Manager": "",                     # filled after the tree is wired
            "[F] Manager ID": "",
            "Future Organization": top_level_for(code),
            "Short Code": code,
            "[D] Employee Decision": "" if vacant else random.choices(DECISIONS, DECISION_WEIGHTS)[0],
            "[E] Email": email,
            "[E] Location": random.choices(LOCATIONS, LOCATION_WEIGHTS)[0],
            "[E] Job Family": JOB_FAMILY[code],
            "[E] Grade": "",
            "[E] FTE": 1.0,
            "[E] Employment Type": "" if vacant else random.choices(EMPLOYMENT_TYPES, EMPLOYMENT_WEIGHTS)[0],
            "[E] Cost Center": "CC-%s" % code,
            "[E] Position Status": "Vacant" if vacant else "Filled",
            "[E] Start Date": "" if vacant else start.isoformat(),
            "_code": code,
            "_is_leader": is_leader,
        }

    # 1. One leader per supervisory org, in tree order (parents before children).
    for code, _name, _parent, _status, _scoping, _ics in ORG_TREE:
        leader = make_person(code, LEADER_TITLE[code], True, code in vacant_leader_codes)
        depth = len([c for c in org_by_code if code.startswith(c)])
        leader["[E] Grade"] = GRADES[max(0, len(GRADES) - 1 - depth)]
        leader_by_code[code] = leader
        people.append(leader)

    # 2. Individual contributors.
    for code, _name, _parent, _status, _scoping, ic_count in ORG_TREE:
        titles = IC_TITLES[code]
        for i in range(ic_count):
            vacant = (code, i) in vacant_ic_slots
            person = make_person(code, titles[i % len(titles)], False, vacant)
            person["[E] Grade"] = random.choice(GRADES[:5])
            if not vacant and random.random() < 0.12:
                person["[E] FTE"] = random.choice([0.6, 0.8, 0.8, 0.5])
            people.append(person)

    # 3. Supervisory organization rows (name needs the leader, so build them now).
    so_rows = []
    so_name_by_code = {}
    for idx, (code, name, parent, status, scoping, _ics) in enumerate(ORG_TREE, start=1):
        leader = leader_by_code[code]
        leader_label = leader["[E] First Name, Last Name"] or "Vacant"
        so_id = "SO-%04d" % (idx * 10)
        so_name = "%s (%s) (%s)" % (name, leader_label, so_id)
        so_name_by_code[code] = so_name
        so_rows.append({
            "code": code, "name": name, "parent": parent, "status": status,
            "scoping": scoping, "so_id": so_id, "so_name": so_name,
            "manager": leader_label,
        })

    # 4. Wire people into the supervisory orgs and the management chain.
    for person in people:
        code = person["_code"]
        person["[F] Supervisory Organization 🔗"] = so_name_by_code[code]
        if person["_is_leader"]:
            parent_code = org_by_code[code][2]
            manager = leader_by_code[parent_code] if parent_code else None
        else:
            manager = leader_by_code[code]
        if manager is not None:
            person["Future Manager"] = manager["Position ID"]
            person["[F] Manager ID"] = manager["[E] Employee ID"]

    # 5. Headcount rollup per supervisory org = FTE of its direct members.
    fte_by_code = {}
    for person in people:
        fte_by_code[person["_code"]] = round(
            fte_by_code.get(person["_code"], 0.0) + float(person["[E] FTE"]), 2)

    depth_by_code = {}

    def depth_of(code):
        if code in depth_by_code:
            return depth_by_code[code]
        parent = org_by_code[code][2]
        depth_by_code[code] = 0 if parent is None else depth_of(parent) + 1
        return depth_by_code[code]

    # ─── Write Employees & Positions ─────────────────────────────────────────
    employee_columns = [
        "Position ID", "[E] Employee ID", "[E] First Name, Last Name", "REF Title [F]",
        "[F] Supervisory Organization 🔗", "Future Manager", "[F] Manager ID",
        "Future Organization", "Short Code", "[D] Employee Decision", "[E] Email",
        "[E] Location", "[E] Job Family", "[E] Grade", "[E] FTE",
        "[E] Employment Type", "[E] Cost Center", "[E] Position Status", "[E] Start Date",
    ]
    emp_path = os.path.join(OUT_DIR, "Employees & Positions.csv")
    with open(emp_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=employee_columns)
        writer.writeheader()
        for person in people:
            writer.writerow({k: person[k] for k in employee_columns})

    # ─── Write Supervisory Organizations ─────────────────────────────────────
    so_columns = [
        "Supervisory Organization", "Parent Supervisory Organization", "SO Status",
        "Scoping", "Short Code", "SO ID", "Manager", "Org Level",
        "[C] SupOrgAssignement % Rollup (from Employees & Positions / FUTURE)",
    ]
    so_path = os.path.join(OUT_DIR, "Supervisory Organizations.csv")
    with open(so_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=so_columns)
        writer.writeheader()
        for row in so_rows:
            writer.writerow({
                "Supervisory Organization": row["so_name"],
                "Parent Supervisory Organization":
                    so_name_by_code[row["parent"]] if row["parent"] else "",
                "SO Status": row["status"],
                "Scoping": row["scoping"],
                "Short Code": row["code"],
                "SO ID": row["so_id"],
                "Manager": row["manager"],
                "Org Level": depth_of(row["code"]),
                "[C] SupOrgAssignement % Rollup (from Employees & Positions / FUTURE)":
                    fte_by_code.get(row["code"], 0),
            })

    # ─── Write Org Design Data + Notes ───────────────────────────────────────
    write_org_design(people, org_by_code, depth_of)

    vacancies = sum(1 for p in people if p["[E] Position Status"] == "Vacant")
    print("Wrote %s (%d rows, %d vacant)" % (emp_path, len(people), vacancies))
    print("Wrote %s (%d rows)" % (so_path, len(so_rows)))


# ─── Org design data (the stacked deck) ──────────────────────────────────────


def write_org_design(people, org_by_code, depth_of):
    """Derive the flat deck table from the same people.

    CURRENT headcount is the people table as it stands (filled positions);
    FUTURE applies SCENARIO. Vacancies already in the people table become
    posted roles, so the two files never disagree about who exists today.

    Row emission per (org, position title), mirroring what the Apps Script
    model expects on each side:

      unchanged     one row, Stack blank        — counts on both sides
      in selection  one row, Stack blank        — status "In selection process"
      reduced by k  two rows: Stack "Current" (current=n, future=n-k, at risk)
                    and Stack "Future" (current=0, future=n-k, mapped)
      new / vacant  one row, Stack "Future"     — status "Posted"
    """
    # Distinct ISO-3 codes per org, from where its people actually sit.
    countries_by_code = {}
    for person in people:
        iso = LOCATION_ISO.get(person["[E] Location"])
        if not iso:
            continue
        countries_by_code.setdefault(person["_code"], set()).add(iso)

    # Filled and vacant counts per (org code, title).
    filled, vacant = {}, {}
    for person in people:
        key = (person["_code"], person["REF Title [F]"])
        if person["[E] Position Status"] == "Vacant":
            vacant[key] = vacant.get(key, 0) + 1
        else:
            filled[key] = filled.get(key, 0) + 1

    name_of = {code: org_by_code[code][1] for code in org_by_code}

    def ancestors(code):
        """Codes from the root down to `code`, inclusive."""
        chain, cur = [], code
        while cur:
            chain.append(cur)
            cur = org_by_code[cur][2]
        return list(reversed(chain))

    def dlt_columns(code):
        """The DLT ladder describing a SLIDE, blank below its own level.

        The filter tree nests slides by this path, so a DLT-1 slide must not
        carry a DLT-2 value — that would file it under one of its own children.
        """
        chain = ancestors(code)
        cols = {"DLT": COMPANY_NAME}
        for i, c in enumerate(chain[1:], start=1):
            if i <= 6:
                cols["DLT-%d" % i] = name_of[c]
        return cols

    rows = []

    def emit(slide_code, org_code, title, cur, fut, stack, status):
        if cur == 0 and fut == 0:
            return
        cols = dlt_columns(slide_code)
        iso = sorted(countries_by_code.get(org_code, {"CHE"}))
        rows.append({
            "Slide Title": name_of[slide_code],
            "Section Name": name_of[slide_code],
            "Section Level": "DLT-%d" % depth_of(slide_code) if depth_of(slide_code) else "DLT",
            "Level": "DLT-%d" % depth_of(org_code) if depth_of(org_code) else "DLT",
            "Supervisory Organization": name_of[org_code],
            "Position Name": title,
            # zlib.crc32, not hash(): Python randomises string hashing per
            # process, which would make the file non-deterministic.
            "Position ID": "P-%s-%04d" % (org_code, zlib.crc32(title.encode()) % 10000),
            "Current HC": cur,
            "Future HC": fut,
            "FTE": 1.0,
            "Country": ", ".join(iso[:3]),
            "Stack": stack,
            "Status": status,
            "DLT": cols.get("DLT", ""),
            "DLT-1": cols.get("DLT-1", ""), "DLT-2": cols.get("DLT-2", ""),
            "DLT-3": cols.get("DLT-3", ""), "DLT-4": cols.get("DLT-4", ""),
            "DLT-5": cols.get("DLT-5", ""), "DLT-6": cols.get("DLT-6", ""),
        })

    def emit_org(slide_code, org_code):
        scenario = SCENARIO.get(org_code, {})
        at_risk = scenario.get("at_risk", {})
        in_selection = set(scenario.get("selection", []))
        titles = sorted({t for (c, t) in list(filled) + list(vacant) if c == org_code})

        for title in titles:
            n = filled.get((org_code, title), 0)
            if n:
                cut = min(n, at_risk.get(title, 0))
                if cut:
                    emit(slide_code, org_code, title, n, n - cut, "Current", "At risk")
                    emit(slide_code, org_code, title, 0, n - cut, "Future", "Mapped")
                elif title in in_selection:
                    emit(slide_code, org_code, title, n, n, "", "In selection process")
                else:
                    emit(slide_code, org_code, title, n, n, "", "Mapped")
            v = vacant.get((org_code, title), 0)
            if v:
                emit(slide_code, org_code, title, 0, v, "Future", "Posted")

        for title, count in scenario.get("new", []):
            emit(slide_code, org_code, title, 0, count, "Future", "Posted")

    # One slide per organization that has children: a DLT-1 function slide shows
    # its whole subtree; a DLT-2 slide shows just its own branch, so a reader can
    # drill without re-reading the parent.
    children_of = {}
    for code in org_by_code:
        parent = org_by_code[code][2]
        if parent:
            children_of.setdefault(parent, []).append(code)

    def subtree(code):
        out = [code]
        for child in sorted(children_of.get(code, [])):
            out.extend(subtree(child))
        return out

    root = next(c for c in org_by_code if org_by_code[c][2] is None)
    slide_codes = [c for c in org_by_code
                   if depth_of(c) in (1, 2) and children_of.get(c)]
    slide_codes.sort(key=lambda c: (depth_of(c), name_of[c]))
    # The root gets a slide too, showing the top two layers.
    slide_codes.insert(0, root)

    for slide_code in slide_codes:
        if slide_code == root:
            members = [root] + sorted(children_of.get(root, []))
        else:
            members = subtree(slide_code)
        for org_code in members:
            emit_org(slide_code, org_code)

    design_columns = [
        "Slide Title", "Section Name", "Section Level", "Level",
        "Supervisory Organization", "Position Name", "Position ID",
        "Current HC", "Future HC", "FTE", "Country", "Stack", "Status",
        "DLT", "DLT-1", "DLT-2", "DLT-3", "DLT-4", "DLT-5", "DLT-6",
    ]
    design_path = os.path.join(OUT_DIR, "Org Design Data.csv")
    with open(design_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=design_columns)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

    notes_path = os.path.join(OUT_DIR, "Org Design Notes.csv")
    slide_names = []
    seen = set()
    for row in rows:
        if row["Slide Title"] not in seen:
            seen.add(row["Slide Title"])
            slide_names.append(row["Slide Title"])
    with open(notes_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=[
            "Slide", "Slide Subtitle", "Potential People Impact",
            "Organizational Ambition"])
        writer.writeheader()
        for name in slide_names:
            subtitle, impact, ambition = SLIDE_NOTES.get(
                name, ("Target organization design", "", ""))
            writer.writerow({
                "Slide": name,
                "Slide Subtitle": subtitle,
                "Potential People Impact": impact,
                "Organizational Ambition": ambition,
            })

    print("Wrote %s (%d rows, %d slides)" % (design_path, len(rows), len(slide_names)))
    print("Wrote %s (%d rows)" % (notes_path, len(slide_names)))


if __name__ == "__main__":
    main()
