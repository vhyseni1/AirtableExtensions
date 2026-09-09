#!/usr/bin/env python3
"""Generate the Org Hub sample data set.

Writes two CSVs that mirror the field names the extension reads (see
`frontend/config.js`):

  * ``Employees & Positions.csv``       — one row per position (filled or vacant)
  * ``Supervisory Organizations.csv``   — one row per supervisory organization

The two files are internally consistent: every person sits in a supervisory
organization that exists, every manager reference resolves, the headcount
rollup on each supervisory org equals the FTE of its direct members, and the
short codes are hierarchical (a ``DSG`` leader's subtree is exactly the rows
whose Short Code starts with ``DSG``).

Deterministic — ``random`` is seeded, so re-running produces the same data.

Usage:  python3 generate.py
"""

import csv
import os
import random
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

    vacancies = sum(1 for p in people if p["[E] Position Status"] == "Vacant")
    print("Wrote %s (%d rows, %d vacant)" % (emp_path, len(people), vacancies))
    print("Wrote %s (%d rows)" % (so_path, len(so_rows)))


if __name__ == "__main__":
    main()
