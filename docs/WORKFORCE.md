# Temporary workforce

Trapple keeps track of people who travel for the company but are not permanent
employees: temporary labourers, contract workers and outsourced staff. Their
trips arrive in the same uploaded sheets and PDFs as everyone else's, usually
without an employee ID. This guide explains how the app handles them, what the
Travel Desk and the Director can do, and how the figures are worked out.

**Where:** Insights → Intelligence → **Temporary workforce**
(`/travel/bi/workforce`). Click a name to open that worker's page.

**Who:** the booking assistant can look; the **Travel Desk** and the
**Director** can also change records. Approvers and employees cannot see it.

---

## 1. Kinds of worker and statuses

Everyone in the app is one person record (a "profile"), whether they are a
permanent employee or a day labourer. Each has a **kind of worker**:

| Kind | Meaning |
| --- | --- |
| Permanent employee | On the company's payroll. Only these people can have a login. |
| Temporary worker | Short-term labour. |
| Contract worker | Supplied under a contract. |
| Outsourced worker | Employed by another company. |
| Unknown / not classified | Came from an upload and nobody has said what they are yet. |

and a **status**:

| Status | Meaning |
| --- | --- |
| Unverified (from an upload) | Created by an upload; nobody has checked them. |
| Possible duplicate | Created by an upload although the app showed a possible match. Check before verifying. |
| Verified | A person has checked this record. |
| Merged | Turned out to be the same person as another record; their trips moved there. |

Marking someone **inactive** uses the existing "active" switch. Their trips stay
in every report.

**Imported workers never get a login.** The database refuses a login for anyone
who is not a permanent employee, including when someone confirms an email that
matches a worker's record.

---

## 2. What happens when you upload a sheet or PDF

Nothing about the upload steps changes, except the **People** step.

For every traveller without an employee ID, the app checks, in order:

1. **Exact name** (the same words in any order, titles ignored: "KUMAR/RAVI MR" =
   "Mr. Ravi Kumar"). The suggestion says who the match is, for example "Same name
   as a known temporary worker".
2. **Spellings saved earlier.** When you link "R KUMAR" to Ravi Kumar once, every
   later upload recognises "R KUMAR" by itself.
3. **Possible matches**, shown as buttons with the reason:
   - *Initials match*: "R Kumar" or "Ravi K" and "Ravi Kumar".
   - *One name is part of the other*: "Ravi" and "Ravi Kumar".

   A shared surname alone ("Ravi Kumar" / "Suresh Kumar") or shared initials
   alone are **not** a match.

The app **never links anyone on a possible match, and never adds a new person
while a possible match exists.** That person waits for you to decide. In the
one-click "Upload anything", their lines are left out with a note, and you
upload the file step by step to decide.

**Add as a new person** asks for:

- **Kind of worker**: Unknown unless you choose. Only the Travel Desk or the
  Director can choose; the booking assistant adds people as Unknown.
- **Contractor** (optional): filled in from the sheet when it has a column such
  as "Contractor", "Labour contractor", "Labour supplier", "Sub-contractor" or
  "Manpower agency". The travel agent column ("Vendor", "Agency", "Travel agent")
  is kept as the travel agent and is never used as a contractor.

When the upload is saved, new people get the kind you chose and the status
*Unverified* (or *Possible duplicate*). Linking someone never changes an existing
person's kind or status.

Uploading the same file again imports nothing twice: every line carries a
fingerprint, and a line already on file is reported as "Already imported".

---

## 3. Looking after workers (Travel Desk and Director)

Open a worker from the Temporary Workforce page. Every change below is written
to the audit log and listed under **Identity history**.

| Action | Notes |
| --- | --- |
| **Verify** | You have checked who this is. |
| **Kind of worker** | Someone with a login always stays a permanent employee. |
| **Contractor** | Pick or type a name; leave empty to clear. Not for permanent employees. |
| **Project** | **A reason is required** (a work order, the sheet's project column…). Projects are never guessed from names. |
| **Other spellings** | Add or remove. A spelling can belong to only one person. |
| **Mark inactive / active** | Trips stay in every report. |
| **Merge with another record** | See below. |

### Merging two records of the same person

Use this when two records are the same person, for example "R Labour" and
"Ramu Labour" with the same ID card. **Similar names alone are not enough.**

1. Open one of them and choose **Merge with another record…**
2. Search for the other record, choose **which one to keep**, and write **why**
   they are the same person.
3. The trips (with all their costs) and expense claims move to the record you
   keep. The other record's name becomes a saved spelling of the person kept,
   and the other record is marked *Merged* and inactive.

Nothing is deleted. Documents stay filed where their files are and are shown on
the person kept. The app records exactly which trips, claims and spellings
moved.

A merge is **refused** when:

- the record being merged away has a **login**, **travel requests** or
  **group bookings** (merge the other record into it instead), or
- both records have the **same booking** (same date and PNR). Check those trips
  first.

**Undo:** in Identity history, choose **Undo merge**. Exactly what moved goes
back, the spelling the merge added is removed (spellings you saved by hand
stay), and the old record returns to how it was. A merge can be undone once.

---

## 4. How the figures are worked out

The worker list, the worker page and **Travel spend analytics** use the same
rules:

- **Only trips and their costs on file.** A trip's costs come from its cost
  lines (each fare, add-on, refund…), or from the trip's own amount when it has
  none (scanned tickets, trips entered by hand). Expense claims, and anything
  that is not a trip cost (wages included), are not travel spend.
- **Gross, credits and net.** Gross is the positive amounts, credits are
  refunds (negative), net is both together.
- **One currency at a time.** Only the company's base currency (INR) is added
  up. Other currencies are listed apart and never converted.
- **A blank cost is missing, never zero.** Missing costs are counted and shown.
- **A 0 fare is kept** and counted as a zero fare, but left out of the average
  ticket fare, as are trips with a missing cost.
- **Cancelled trips** are counted apart and left out of spend, as on the other
  dashboards.
- **No double counting.** Each trip belongs to exactly one person, so
  "permanent" and "temporary, contract & others" add up to the total exactly
  once.
- **Domestic or international.** A trip is international when any place on it
  is outside the company's home country, domestic when every place is known and
  inside it, and "place not recognised" otherwise (same rule as Travel
  Intelligence).
- **Projects** come from the project linked to each trip; a trip with none is
  *Unassigned*. **Contractors** come from the worker's record; none is
  *Unknown*.

`supabase/tests/workforce_analytics_test.sql` checks every analytics figure
against totals worked out by hand.

---

## 5. For developers

| Part | Migration | What it adds |
| --- | --- | --- |
| 1 | `20261115100000_workforce_model.sql` | `profiles.workforce_type`, `verification_status`, `source`, `contractor_id`, `primary_project_id`, `work_location`, `contact_phone`, `merged_into`; tables `contractors`, `person_aliases`, `identity_merges`; login guard |
| 2 | `20261115120000_workforce_import.sql` | People step: saved spellings, possible matches, kind of worker and contractor on "create", alias memory on commit |
| 3 | `20261115140000_workforce_manage.sql` | `workforce_list`, `workforce_detail`, `workforce_set_type`, `workforce_verify`, `workforce_alias_add` / `_remove`, `workforce_set_contractor`, `workforce_set_project`, `workforce_merge`, `workforce_unmerge`; `private.trip_money()` |
| 5 | `20261115160000_workforce_analytics.sql` | `workforce_analytics(filters)` |

- **Access:** reading needs `private.can_view_workforce()` (travel desk, Travel
  Desk, Director); changing needs `private.can_manage_workforce()` (Travel Desk,
  Director) and `private.can_manage_person()`. The new tables are read-only to
  the browser; every change goes through the functions above.
- **Screens:** `client/src/pages/travel/BiWorkforce.tsx`,
  `WorkforceDetail.tsx`, `WorkforceAnalyticsPanel.tsx`; data in
  `client/src/lib/data/workforce.ts`; the People step in `ImportTravel.tsx`.
- **Tests:** `supabase/tests/workforce_test.sql`, `workforce_import_test.sql`,
  `workforce_manage_test.sql`, `workforce_analytics_test.sql` (run by
  `pnpm test:rls`), and `client/src/__tests__/workforce*.test.ts`.
- **Running `pnpm test:rls` on a Mac:** PostgreSQL needs a short socket path and
  a locale, for example:
  `LC_ALL=en_US.UTF-8 TMPDIR=$PWD/.pgt PGBIN=/opt/homebrew/opt/postgresql@16/bin pnpm test:rls`
  (create `.pgt` first and delete it afterwards).
- **One company today.** New tables carry `company_id` like the rest of the
  schema, but `profiles` has none yet, so separating several companies would
  need that first.
- **Known difference from older reports:** `private.refresh_trip_amount` keeps
  a trip's stored total at 0 or more, so a refund larger than the fare does not
  show there. The workforce figures read the cost lines directly and show it.
