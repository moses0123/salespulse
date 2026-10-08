# SalesPulse — Telemarketing & Outbound Sales CRM

A branch of **TaskPulse**: same foundation (Next.js 14 App Router, TypeScript, Tailwind, Mongoose/MongoDB, JWT sessions, SMTP + WhatsApp-webhook notifications, PWA, Excel exports, light/dark theme) — rebuilt around the outbound-sales workflow:

> **Give the telemarketer a list → make the call → capture the outcome → create the next action → automatically update management.**

SalesPulse is a **separate app with its own database and its own users**. Nothing is shared with a TaskPulse deployment at runtime; the code was forked from TaskPulse so both products look and behave alike.

## What's in the MVP

| Module | Where |
|---|---|
| Lead database — **only the lead's name and phone number are required**; company, email, industry, location, website, product, source, notes, deal value are optional | **Leads** page + lead drawer |
| **Bulk upload** (daily lead lists) — any .xlsx / .xls / .csv layout: SalesPulse finds the name and phone columns itself (by header, or by content when there are no headers) and lets you correct the match; preview of duplicates / invalid numbers before anything is saved; upload history | **Leads → Bulk upload**, **My Day → Bulk upload** |
| Lead template (Excel + CSV) to send to whoever supplies leads | download from the Bulk upload window, or `public/templates/` |
| Live duplicate check when adding a lead — shows current owner, last contact and next action | **Add Lead** |
| Lead assignment — one person, round-robin, or balanced by workload (on import or in bulk) | **Leads** (select rows → Assign) |
| Telemarketer daily workspace — today vs target, overdue, due today, meetings, hot leads, new leads | **My Day** |
| Click-to-call (`tel:`) that opens the outcome form, WhatsApp button with a templated message (logged on the timeline) | every lead card |
| Call outcomes (12) → stage, score, temperature and next action update automatically | **Log call** modal |
| Follow-ups: schedule, remind, complete, reschedule, escalate | **Follow-ups** page, queue, drawer |
| Meetings: booked automatically from "Meeting booked", outcomes (demo completed, proposal requested, negotiation, converted, reschedule…) | **Meetings** page |
| Lead activity timeline | lead drawer |
| Pipeline board (drag to move stage; Lost asks for a reason) | **Pipeline** |
| Lead scoring 0–100 → Hot / Warm / Cold | automatic |
| Management dashboard — KPIs, funnel + conversion rates (§22), team performance, product/industry/source performance, overdue + gone-quiet lists | **Dashboard** |
| Daily/weekly/monthly reports, generated automatically, + end-of-day comment, Excel export | **Reports** |
| Notifications — in-app bell always; email/WhatsApp optional | bell + `/api/cron/*` |

**The rule the system enforces:** every open lead has a clear status and, where action is needed, a next action with an owner and a due date. A call whose outcome keeps the lead open ("No answer", "Interested", "Call back later"…) cannot be saved without a follow-up date; "Meeting booked" requires the meeting time. Logging a new call/outcome closes the lead's previous open follow-up, so there is always exactly one next action.

## Roles

| | Super Admin | Sales Manager / Team Leader | Telemarketer |
|---|---|---|---|
| Users & Settings (SMTP, WhatsApp, products, sales rules) | ✅ | ❌ | ❌ |
| See leads | all | all | only assigned to them |
| Add a lead | ✅ | ✅ (assign to anyone) | ✅ (assigned to themselves) |
| Bulk upload leads | ✅ (leave unassigned or distribute) | ✅ (leave unassigned or distribute) | ✅ (assigned to themselves) |
| Bulk assign/reassign | ✅ | ✅ | ❌ |
| Force-add a lead whose phone already exists | ✅ | ✅ | ❌ (sees who owns it instead) |
| Log calls, follow-ups, meetings, move stage | ✅ | ✅ | ✅ own leads |
| Dashboard | ✅ | ✅ | ❌ (My Day + own report) |
| Reports | whole team | whole team | own row only |
| View another person's queue | ✅ | ✅ | ❌ |

Every API route re-checks role and lead ownership server-side (`lib/scope.ts`, `lib/auth.ts`).

## Setup

```bash
npm install
cp .env.example .env.local      # then edit it
npm run create-admin -- "Your Name" you@example.com "a-strong-password"
npm run dev                      # http://localhost:3000
```

`.env.local`:

```
MONGODB_URI=mongodb://127.0.0.1:27017/salespulse   # its own DB — not the TaskPulse one
NEXT_PUBLIC_APP_URL=http://localhost:3000
JWT_SECRET=<openssl rand -base64 48>
APP_TIMEZONE=Africa/Lusaka                          # defines "today" for queues/reports/reminders
NEXT_PUBLIC_DEFAULT_COUNTRY_CODE=260                # "0977…" → "260977…" for duplicate detection
CRON_SECRET=<random string>                         # for the scheduled endpoints
```

Then, as the Super Admin: **Settings** → add your products (e.g. Sales CRM, VisitFlow, Odoo ERP), adjust the WhatsApp message template, and (optionally) SMTP / WhatsApp webhook. **Users** → add managers and telemarketers with their daily call targets.

## Telecaller Daily Call Report

The team's Excel report (*Telecaller_Daily_Call_Report.xlsx*) is generated from logged calls — nobody types it in.

**Reports → Download report (Excel)** (pick Today / Yesterday / any range; managers can filter to one telecaller) gives the same workbook the team already used:

- **Dashboard** — From/To dates, then *Call Summary* (Total Calls, Connected, Not Connected, New Leads Called, Follow-up Calls, Total Talk Time, Avg Call Length, Interested, Not Interested, Hot/Warm/Cold, Deals Closed, Connect Rate, Interest Rate), *Product Interest*, *Calls by Lead Source* and *Follow-ups Due*, one column per telecaller plus Team Total. Cells are the original COUNTIFS/SUMIFS formulas, saved with their values, so the file reads correctly in phone previews and still recalculates if the dates are changed.
- **Lists** — the dropdown values.
- **One sheet per telecaller**, one row per call, columns A–P exactly as before: Date · Customer Name · Phone Number · Company / Business · City · Lead Source · Call Type · Call Status · Call Duration (mins) · Product Interested In · Lead Type · Hot / Warm / Cold · Reason (if Not Interested) · Next Action · Follow-up Date · Remarks (the call time is at the start of Remarks).

The same numbers are on the **Reports** page, live. Telemarketers can download their own sheet.

Where each column comes from (all captured in the *Log call* form):

| Column | Source |
|---|---|
| Call Type | automatic — first call to the lead = New Lead, otherwise Follow-up |
| Call Status | the outcome picked: Connected / Not Answered / Busy / Switched Off / Wrong Number / Call Back Later |
| Call Duration | timer starts when **Call** is pressed; editable |
| Product Interested In | product chips (Settings → Products); two or more = "Multiple Products", none = "None" |
| Lead Type | automatic from the outcome (Interested / Not Interested) |
| Hot / Warm / Cold | picked on the call, or from the lead score; blank when nobody answered |
| Reason (if Not Interested) | required for "Not interested" — Price too high, Using another product, No need right now, Not the decision maker, Busy - call later, Budget issue, Other |
| Next Action | Send Demo, Send Brochure on WhatsApp, Send Quotation, Schedule Meeting, Follow-up Call, Pass to Sales Team, Deal Closed, No Action |
| Follow-up Date | the follow-up / meeting date set on the call |

Lead sources follow the sheet: Google Search, VisitFlow, Meta Leads, Referral, Website, Other (uploads map "Facebook/Instagram" → Meta Leads, "Google Maps" → Google Search, etc.). Add the products — Visit Flow, Marichi Pulse, Marichi Talks (WhatsApp), Guardly — under **Settings → Products** so they appear as rows.

"Follow-ups Due" in the file is live from SalesPulse (open follow-ups at download time), so a follow-up that has been done no longer counts as overdue.

## Bulk upload & the lead template

Leads arrive every day in different formats, so the upload doesn't insist on one layout:

1. **Leads → Bulk upload** (or **My Day → Bulk upload**) and drop the file — `.xlsx`, `.xls` or `.csv`, up to 5,000 rows.
2. SalesPulse picks the sheet, finds the header row (even under a title line), and matches columns such as *Client / Full Name / Customer* → **Lead name** and *Mobile No. / Cell / WhatsApp / Tel* → **Phone number**. With no header row it works out which column holds phone numbers and which holds names. Every match can be changed from a dropdown; only name and phone are required.
3. **Check** shows what will happen to every row — new, number already in SalesPulse (skipped, with its owner), repeated in the file (skipped), company already exists, invalid number, missing name/phone — with real sheet row numbers. Nothing is saved until **Upload**.
4. Two numbers in one cell (`0977… / 0966…`) → the first is used, the rest go in the lead's notes. Excel numbers that lost their leading 0 are handled.

**The template** — `public/templates/salespulse-lead-template.xlsx` (and `.csv`): a *Leads* sheet with **Lead Name \*** and **Phone Number \*** (yellow, required) followed by the optional columns, the phone column pre-formatted as text so Excel keeps the leading 0, a Source drop-down, and an *Instructions* sheet with example rows. Download it from the Bulk upload window and attach it when asking for leads. Regenerate it with `python3 scripts/make-lead-template.py` if you change the columns (`lib/leadColumns.ts`).

## Scheduled reminders

A Next.js app has no background process, so three endpoints need a scheduler (`Authorization: Bearer <CRON_SECRET>`; GET or POST; a signed-in Super Admin can also trigger them by hand):

| Endpoint | When | Does |
|---|---|---|
| `/api/cron/hourly` | every hour | reminds owners of follow-ups due within the hour and meetings within 2h; escalates follow-ups overdue > N hours to the person's team leader (grouped, one message per manager) |
| `/api/cron/morning` | ~07:00 | each telemarketer's day at a glance; managers get "hot leads not contacted / leads gone quiet / assigned but never worked" |
| `/api/cron/daily-summary` | ~18:00 | today's team numbers to every manager |

`vercel.json` already schedules these for Vercel (times there are UTC: 05:00/16:00 UTC = 07:00/18:00 in Zambia). Elsewhere, use crontab / a GitHub Action with `curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/hourly`. All three are idempotent.

## How outcomes move a lead

| Outcome | Stage (forward only) | Score | Next action |
|---|---|---|---|
| No answer / Busy | Contacted | — | required (retry suggested tomorrow / in 3h) |
| Wrong number | Contacted | — | none — phone flagged invalid |
| Not interested | **Lost** | −20 | none |
| Call back later / Follow-up required | Connected | +10 | required |
| Interested | Interested | +30 | required |
| Meeting requested | Qualified | +30 | required |
| Meeting booked | Meeting Booked | +35 | meeting created |
| Proposal requested | Qualified | +40 | required ("Send proposal") |
| Converted | **Won** | =100 | optional onboarding follow-up |
| Do not contact | **Lost** + blocked | =0 | none |

"Identified a need" adds +20 and "Asked for pricing" +15 (spec §13). 80–100 = Hot, 40–79 = Warm, 0–39 = Cold; the telemarketer's own interest-level pick overrides the temperature for that call. A call never moves a lead backwards in the pipeline. All of this lives in one file: `lib/sales.ts`.

## Project structure (what's new vs TaskPulse)

```
lib/sales.ts           Stages, sources, outcomes, scoring, phone/company normalisation, WhatsApp template (shared client+server)
lib/leadService.ts     logCall(), createFollowUp(), bookMeeting(), recordMeetingOutcome(), changeStage(), assignLeads()
lib/metrics.ts         The one place every report/dashboard number is computed from (Activity log)
lib/duplicates.ts      Phone/company/email duplicate lookup with owner + next action
lib/assignment.ts      one-person / round-robin / least-loaded distribution
lib/callReport.ts      Telecaller Daily Call Report data (one row per call, per-telecaller totals)
lib/callReportXlsx.ts  Writes the report workbook (exceljs) in the team's original layout
lib/leadColumns.ts     Bulk-upload columns, header aliases, auto-detection (by header and by content)
lib/notifications.ts   notifyUser() + hourly / morning / daily-summary sweeps
lib/time.ts            APP_TIMEZONE-aware day boundaries
models/                Lead, Activity, FollowUp, Meeting, Product, DailyNote, ImportLog (+ User, Settings, NotificationLog from TaskPulse)
app/(app)/             dashboard, queue (My Day), leads, follow-ups, meetings, pipeline, reports, users, settings
app/api/               leads (+ calls, stage, notes, follow-ups, meetings, import, assign, export, check-duplicate, facets),
                       follow-ups, meetings, queue, pipeline, dashboard, reports, products, notifications, cron, settings
components/modals/     LeadDrawer, LogCallModal, FollowUpModal, BookMeetingModal, MeetingOutcomeModal, AddLeadModal, ImportLeadsModal, AssignLeadsModal
```

## Notes

- Report numbers are computed from the activity log with a lean query + in-process tally rather than `$group/$cond`, so they work on Atlas, DocumentDB, Cosmos DB and FerretDB alike and stay fast at team volumes.
- Phase 2/3 items from the spec (call scripts, campaigns, Google Calendar, AI research/summaries, predictive scoring) are not in this build; the data model (Activity log with outcomes, products, sources) is what they'd build on.
