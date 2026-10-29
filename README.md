# The Gardens Pickleball Courts

Private accounting, partner-capital and employee attendance app built with Next.js for Vercel.

## Features

### Business workspace navigation

The main navigation is Dashboard, Accounting, HR, Financing, Operations and Marketing. Dashboard contains team status and module shortcuts. Financing, Operations and Marketing are explicitly planned landing pages. All transaction entry, charts, partner accounts, payroll posting, exports, BIR settings and backups are inside Accounting. HR retains attendance and per-shift pay previews; monthly payroll review/export/posting is in Accounting. Basic device preferences are in the user menu. There is no global transaction-entry button.

The supplied crest is served unchanged as `/gardens-crest.jpg`, including on sign-in and report headers. The interface uses its cream, green, burgundy and gold palette. Accounting has a shared date range, daily/monthly income/expense charts, category drill-downs and consolidated cash movement. Cash movement shares classification logic with the cash-flow report; transfers cancel across money accounts, while funding/deposits remain separate from earned revenue.

### Categories and named transaction presets

Authenticated `category_definition` and `type_definition` records are versioned through `parentId` and stable `entityId`. Category groups map only to existing ledger accounts; presets map only to existing supported transaction behaviors. Built-in behaviors are protected. Case-insensitive duplicate names are rejected; custom definitions may be renamed, remapped or archived. Archiving blocks new use, without altering existing transactions. Each saved transaction stores server-generated category/type snapshots, so later definition changes cannot rewrite its historical names or ledger mapping. Daily summaries can contain multiple custom income categories sharing one parent account.

Create definitions in Accounting → Settings & closing, or inline during entry. Searchable selectors, draft-preserving creation, relevant form fields and live entry totals support phone use. CSV transaction and sales/purchase registers include custom names while general-ledger accounts retain their canonical accounting meaning.

- Sales, expenses, collections, customer deposits, partner funding and withdrawals.
- Balanced journals, financial position, profit and loss, reconciliation and CSV exports.
- Original capital-cost rows and partner summaries, preserved separately from accounting classification.
- Employee clock-in/out, unpaid breaks, absence and leave counts, overnight shifts and calculated gross shift earnings.
- Private invoice/document uploads up to 8 MB and append-only accounting history.

## Run locally

Use Node.js 22.13 or newer.

```sh
npm ci
npm run dev
```

Create an ignored `.env.local` with `APP_STORAGE=local`, `OWNER_EMAIL`, `SESSION_SECRET` (at least 32 random characters), and `OWNER_SETUP_HASH` (the SHA-256 digest of a random setup token). Local records are stored under the ignored `.local-data/` directory. Open `/setup#YOUR_SETUP_TOKEN` and create the administrator password. The token is sent in a POST body rather than a URL query and stops working after setup.

## Production on Vercel

`vercel.json` explicitly selects Next.js, uses `npm run build`, and emits `.next`. Attach a **private** Vercel Blob store to the Production environment and configure:

| Variable | Purpose |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Private server-side storage access and constrained browser-upload tokens |
| `OWNER_EMAIL` | The single administrator's email address |
| `SESSION_SECRET` | Random signing key for secure, HttpOnly session cookies |
| `OWNER_SETUP_HASH` | SHA-256 digest of the one-time administrator setup token |

Never place environment secrets, backups, original spreadsheets or runtime records in Git. Keep Preview and Development stores separate from Production when enabling those environments.

Records live in the private `gardens/v1/records.json` ledger. Every read bypasses the Blob cache; updates use ETag conditional writes so concurrent requests cannot silently overwrite another saved entry. Document bodies remain private and are delivered only after authentication. Passwords are salted and hashed with scrypt; incoming platform identity headers are not trusted for login.

The current Vercel app does not depend on the earlier Sites deployment. Cloudflare/Vinext starter files retained in Git history are not used by the Next.js production routes.

## Validation

```sh
npm test
npx tsc --noEmit
npm run build
```

Tests cover accounting, capital reconciliation, shift pay, overnight overtime, breaks, leave/absence counts, password/session handling and conflicting ledger writes.

## Accounting and payroll

### Daily employee QR time clock

HR opens on **Daily QR & PINs**. Display the current QR on a screen, download it or print a fresh copy daily. The default rotation is **6:00 AM Asia/Manila**, preserving access through overnight shifts; midnight is configurable. A replacement QR can revoke the current code early. The owner display refreshes automatically every 30 seconds. The public `/time-clock` page receives the QR token in its URL fragment, removes it from the address bar, and sends it only in same-origin POST bodies.

After a valid scan, only active employees with a configured PIN appear in the name selector. The employee enters a personal six-digit PIN to see their own time-in/out and unpaid-break controls, current shift and latest gross-shift result. The owner configures or resets PINs in HR; salted scrypt hashes live in private security storage and are excluded from financial record exports. No real employee PINs are supplied or generated by deployment.

Public `/api/time-clock` actions require the current signed daily token and employee PIN; roster listing requires a current QR. Persistent attempt limits apply separately from administrator login. Employee requests cannot supply rates, holiday multipliers, historical timestamps or administrative corrections. All clock events use server time, append-only history, idempotent request IDs and the same shift-calculation function as owner-entered attendance. Holidays are classified by the owner for the current workday; scheduled rest-day combinations are derived on the server. Gross wages still require review/posting in Accounting before salary payment.

The QR is an attendance access link, not an owner login. It does not grant access to `/api/records`, financial reports, documents, employee management or another employee's shift details. A printed code must be replaced at rollover; old codes expire server-side even if a phone page remains open. Employees should choose Finish after use; the PIN is held only in page memory and is cleared on Finish. Real timestamp corrections remain owner-only in HR → Attendance.

### Daily accounting and reports

Use **Accounting → Daily income** to record one daily summary supported by manual invoice series/ranges and the booking app's sales report. Revenue categories include court rental, open play, coaching/events, equipment rental and other income. Gross tender collections are posted separately from processing fees; unpaid sales become receivables. Previous collections, customer advances, applications and refunds are separate Transactions entries. Reversing a daily summary allows a corrected replacement; overlapping invoice claims and duplicate active summaries are rejected on the server.

Use **Transactions** for expenses, bills and partial supplier payments, asset/prepayment purchases, transfers, payroll payments, partner contributions/drawings, partner loans and profit distributions. Missing invoice evidence is flagged for review rather than suppressing the underlying expense. Partner-loan repayments and profit distributions cannot exceed recorded available balances for that partner.

**Accounting** provides 23 CSV/printable report packs: financial statements, partner reports, journals/ledgers, trial balance, sales/purchase registers, cash books, receivable/payable aging, deposits, assets/prepayments, payroll, reconciliations, invoice/withholding records, BIR working papers, filing tracker and audit trail. Reports use a common date cutoff; later payments/reversals cannot change an earlier period's statement. Print / Save PDF uses the browser's print facility, with a landscape print stylesheet and repeated table headers. Select individual packs for export.

Asset/prepayment registers attach to an existing purchase and never post its cost again. Straight-line charges start in the selected in-service month, without daily proration. Monthly amounts use cumulative centavo rounding and preserve residual values. Each completed month's charge requires review before posting, and cannot be posted twice.

Profit/loss-sharing percentages are effective-dated, total exactly 100%, and are independent of capital contributed. A preview must cover a single policy. Post an explicitly approved allocation only after closing the underlying period, including reviewed income-tax adjustments. Posting assigns profit/loss to partner equity without moving cash. Cash distribution is a separate transaction. Reopening allocated periods requires reversal of their allocations first. Closing/reopening changes are audited; ordinary settings cannot bypass accounting locks.

### BIR preparation

Setup records COR details, tax profile, accounting-year start, registered tax forms, books and invoice authority. Registration is unconfirmed by default. The app does not issue authorized invoices, register books, generate filing-ready BIR DAT/XML, or submit returns. Working papers remain draft; recorded input VAT is not automatically treated as claimable. Confirm tax types/rates, taxable bases, carryovers, credits, income-tax adjustments and current invoicing/CAS/CBA obligations with the accountant. Filing deadlines are entered from verified sources rather than inferred. The filing tracker keeps return and payment references/documents separately from ledger tax-payment journals.

### Controlled fresh financial start

`scripts/financial-reset.mjs` is an administrator-operated, one-time migration, not a public reset API. With an ignored production environment file, run:

```sh
node --env-file=.env.migration --import ./tests/resolve-ts.mjs scripts/financial-reset.mjs --apply
```

It archives the exact ledger at a unique private Blob key, reads it back, verifies SHA-256, and only then replaces the ledger using the original ETag. A concurrent save aborts the replacement. Financial transactions, capital imports, registers/policies/filings, reconciliations and accounting locks are cleared; settings, administrator credentials and attendance are preserved. The reset audit identifies the archive and excludes historical payroll IDs from new postings. The legacy capital importer returns 410 after reset. Supporting document objects are retained privately and remain referenced by the archive. Re-running the script does not clear new records.

The owner can download the private recovery archive from **Accounting → Settings & closing**. Recovery should be performed by an administrator against a separately verified backup, preserving any records created after the reset; never blindly overwrite a live ledger. Delete the temporary env file after migration/verification. Production financial data, recovery files and credentials must never enter Git.

The configured standard shift is 3:30 PM–11:30 PM with a PHP 650 daily base rate. Clock-out stores the rate snapshot and calculated gross earnings. Reviewed payroll is posted once to wages payable; salary payment is a separate accounting transaction. Configure each employee's employment dates, workdays and benefit coverage.

The app supports internal records and accountant review. Confirm BIR registration, registered books, authorized invoicing, asset/cost allocation, payroll deductions, contributions and applicable labor requirements before statutory reporting. Runtime data and credentials are excluded from this repository.
