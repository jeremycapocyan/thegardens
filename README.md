# The Gardens Pickleball Courts

Private accounting, partner-capital and employee attendance app built with Next.js for Vercel.

## Features

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

The configured standard shift is 3:30 PM–11:30 PM with a PHP 650 daily base rate. Clock-out stores the rate snapshot and calculated gross earnings. Reviewed payroll is posted once to wages payable; salary payment is a separate accounting transaction. Configure each employee's employment dates, workdays and benefit coverage.

The app supports internal records and accountant review. Confirm BIR registration, registered books, authorized invoicing, asset/cost allocation, payroll deductions, contributions and applicable labor requirements before statutory reporting. Runtime data and credentials are excluded from this repository.
