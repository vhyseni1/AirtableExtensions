# Per-leader scoping & row-level security

The org chart can be shared with **all leaders at once**: each signed-in leader
sees only **their own branch** (their position + everyone below, all levels),
rooted at themselves, and can deep-dive any sub-branch. This is driven by the
signed-in user's email (`useSession().currentUser.email`).

## Two layers

| Layer | What it does | Enforced? |
| --- | --- | --- |
| **Extension scoping** (this chart) | Detects the signed-in leader and *displays* only their branch. | **No** — a custom extension always loads the full table client-side (`useRecords`). This is display-only personalization. |
| **Native enforced element** (recommended for sensitive data) | A native Airtable interface list/grid/hierarchy filtered by `Visible to leaders = current user`. | **Yes** — Airtable filters server-side; out-of-scope rows never reach the user. |

Use both together: the chart for navigation/visualisation, and a native element
(filtered by the collaborator field) wherever hard enforcement is required.

## How the extension decides scope

Configured in `frontend/index.js` → `FIELDS`:

- `leaderEmailField` — each leader's email.
- `shortCodeField` — hierarchical code (e.g. `DSG`, `DSGA`). A `DSG` leader sees
  every record whose code **starts with** `DSG`; a `DSGA` leader sees only
  `DSGA*` and never higher.
- `visibleLeadersField` — *Multiple collaborators* field listing every leader
  allowed to see the record (the ancestor-leader chain). **Takes precedence**
  over the short-code prefix when present.
- `adminEmails` — emails that bypass scoping and see the whole org.

Resolution order per viewer:
1. **Admin?** → full org.
2. **`visibleLeadersField`** present and the viewer is listed on some records →
   show exactly those records.
3. Otherwise **short-code prefix** from the viewer's own leader node.
4. No match and not an admin → a "no view available" message.

Scoping stays **off** (full org, unchanged behaviour) until `leaderEmailField`
or `visibleLeadersField` resolves, so nothing breaks before you configure it.
Use the **Fields** button in the toolbar to confirm each field resolved.

## Enforced setup (native element)

1. Add a **Multiple collaborators** field, e.g. `Visible to leaders`. Make sure
   every leader is a collaborator on the base.
2. Run `scripts/populate-visible-leaders.js` in a **Scripting** extension (set
   the field names in its `CONFIG`). It writes each record's ancestor-leader
   chain into that field. Re-run after org/leader changes.
3. In the Interface, add a native element (list, grid, or record hierarchy) on
   the same table and add a filter: **`Visible to leaders` → contains →
   current user**. Each leader now sees only their branch, enforced server-side.
4. Point the extension's `FIELDS.visibleLeadersField` at the same field so the
   chart and the enforced element stay consistent.

### Capacity & performance notes

- **Field size:** each record only holds its **ancestor-leader chain** (≈ org
  depth, typically < 10 collaborators), not all users — comfortably within
  multiple-collaborator limits.
- **Concurrency:** each viewer is an independent client session; Airtable serves
  many interface viewers fine. The extension's scaling factor is the **total
  record count it loads** (the whole table into each client), not the number of
  concurrent users. Thousands of positions are fine; only at tens of thousands
  does client-side build/render get heavy (mitigated by the collapsible Tree
  view and per-leader scoping).
