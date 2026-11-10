# Org chart — field validation sheet

**Purpose:** confirm with the business that the fields below are the right ones,
and supply the ones still missing, so the chart can show a manager **both** their
current and their future organisation.

**How to use this:** work through the "Confirm" column. Anything marked
**NEEDED** is blocking — the feature cannot be built without it.

**Source table:** `Employees & Positions` — one row per **position** (filled or
vacant). Nothing below is written to; the chart is read-only.

---

## A. Fields the chart uses today

The live chart currently renders the **future** organisation. Every field below
is already configured and working.

| # | Field name | What it drives | Required? | Confirm |
| --- | --- | --- | --- | --- |
| 1 | `[E] First Name, Last Name` | The name on the card. **Blank means the position is vacant** and the card shows the role title instead. | Yes | Correct field? |
| 2 | `REF Title [F]` | Job title on the card. | No — card still renders without it | Is this the **future** title? |
| 3 | `[F] Supervisory Organization 🔗` | Organisation shown on the card. | No | Confirm this is the **future** org |
| 4 | `[E] Employee ID` | The person's own unique id. Used to build the reporting lines. | **Yes** | Confirm unique per person |
| 5 | `[F] Manager ID` | The id of this person's **future** manager. Joined to #4 to build the future hierarchy. | **Yes** | **Does this hold an _employee_ id (matching #4), or a position id?** |
| 6 | `Future Manager` | Link to the future manager. Used as a fallback if #5 is empty. | No | Correct field? |
| 7 | `Future Organization` | Powers the "Organization" filter in the toolbar. | No — falls back to #3 | Correct field? |
| 8 | `Short Code` | Hierarchical org code (e.g. `DSG` → `DSGA`). Used to decide which branch a leader may see. | Only if scoping is on | Confirm the coding is hierarchical |
| 9 | `[D] Employee Decision` | Status chip on the card (Retain / Transfer / Exit …). Always hidden from PDF and PNG exports. | No | Confirm this should stay visible on screen |

**How the reporting line is resolved**, in order: `[F] Manager ID` → `[E] Employee ID`
first (most reliable), then the `Future Manager` link, then a name match as a last
resort. The id pair is what keeps the chart correct when two people share a name.

### Not currently configured

| Field slot | Status | Consequence |
| --- | --- | --- |
| Status / accent colour | Off | No colour legend on the chart |
| Leader email | **Not set** | **Nobody is identified as the viewer — everyone sees the whole org** |
| "Visible to leaders" collaborator field | Not set | Per-leader scoping is off |

---

## B. Fields needed for the current organisation

To show the **current** organisation beside the future one. Three were supplied;
the rest are outstanding.

| # | Field name | What it drives | Status |
| --- | --- | --- | --- |
| 10 | `[E] Employee ID of Manager` | The id of this person's **current** manager. Joined to `[E] Employee ID` to build the current hierarchy — the current-state twin of #5. | Supplied — example `22109338` |
| 11 | `[E] Manager Name 🔍` | Current manager's name. Display, and a fallback if #10 is empty. | Supplied — example `Patricia Jackson - Jackie` |
| 12 | `[E] Supervisory Organization` | Current organisation on the card and in the filter. | Supplied — example `XYZBA Operational Excellence Experts 1 (Patricia Jackson - Jackie) (50364057)` |
| 13 | **Current job title** | Job title on the current-state card. Without it, the current chart shows the *future* title (#2) on both tabs, which will read as wrong. | **NEEDED** |
| 14 | **Email address** | Identifies the signed-in person so the chart knows whose organisation to show, and whether they are a manager now / in the future. | **NEEDED — blocking** |

### Why #14 is blocking

The whole feature is defined per viewer: *am I a manager today, am I a manager in
the future*. The chart currently has no way to know who is looking at it. Without
an email field to match against the signed-in Airtable user, there is no "me",
and all four scenarios collapse into "everyone sees everything".

### What does NOT need a new field

The business does **not** need to add a "is a manager" flag for current or future.
Manager status is derived: a person is a manager in a given state if at least one
other row points at them as its manager in that state. Deriving it means it can
never disagree with the chart itself.

---

## C. What each person will see

| Scenario | Today | Future | Shows |
| --- | --- | --- | --- |
| 1 | Manager | Manager | Both tabs — current and future |
| 2 | Manager | Not a manager | Current tab only |
| 3 | Not a manager | Manager | Future tab only |
| 4 | Not a manager | Not a manager | Nothing — needs agreed wording |

**Two decisions for the business, not for the build team:**

- **Scenario 2** — a manager who has a current team and no future one. Showing a
  current tab and no future tab communicates that by omission, with no words
  around it. Decide whether the screen says something explicit, or stays silent
  because the conversation happens offline.
- **Scenario 4** — "sees nothing". A blank screen reads as broken software and
  people will assume the worst. Supply the exact sentence to show.

**One definition to confirm:** a manager is someone with **at least one direct
report**. Confirm whether a **vacant** position counts as a report — it changes
who qualifies, and therefore who sees a Future tab.

---

## D. Summary of what we need back

1. Confirm field #5 (`[F] Manager ID`) holds an **employee id**, not a position id.
2. The **current job title** field name (#13).
3. The **email** field name (#14) — blocking.
4. The wording for scenario 4, and the decision on scenario 2.
5. Whether vacant positions count as direct reports.
