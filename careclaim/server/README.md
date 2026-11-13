# CareClaim API

Express REST API with JWT authentication, bcrypt passwords, role checks, MongoDB/Mongoose models, protected supporting documents, audit records, analytics and premium checkout.

Run through the root workspace scripts. Copy `server/.env.example` to `server/.env`; npm workspace commands execute with `server` as their working directory. Development starts on port 4000. Without `MONGODB_URI`, records persist in `server/data/database.json`; this is a demonstration adapter for synthetic data. Starting with the default demo seed creates patient, hospital, officer and admin accounts (`ROLE@careclaim.demo`, password `Demo@12345`). Never deploy the demonstration database with real patient information.

## MongoDB deployment

Set `MONGODB_URI` to MongoDB Atlas or a MongoDB **replica set**, required for multi-document transactions. Single-node development must initiate a replica set before use. Set `NODE_ENV=production`, `SEED_DEMO=false`, `ALLOW_DEMO_PAYMENTS=false`, a random `JWT_SECRET` of at least 32 characters, an explicit `CLIENT_ORIGIN`, and payment credentials when needed. The production server requires MongoDB and rejects demo seeding/payments. It serves the root Vite `dist` build as well as `/api`.

Deploy **one API process only**. The repository caches collections per process and serializes mutations; multiple workers would have stale views. Transactions atomically write changed Mongo records; JSON mode writes a temporary file and renames it. Mongo indexes cover unique IDs/email/claim numbers, claim status, patient IDs, amounts, document ownership and audit timestamps. This is an educational deployment architecture; monitoring, backups, restore exercises, encryption and retention controls, threat assessment, malware scanning, data agreements and institution-specific compliance review remain deployment work. Validating file magic bytes does not perform malware scanning.

## Provisioning real accounts and policies

Stop the API before running provisioning so its cached state refreshes on restart. Public registration creates patients only. An operator with database access can provision a staff account using a masked password prompt:

```powershell
npm run provision --workspace server -- user --email officer@example.com --name "Claim Officer" --role officer
npm run provision --workspace server -- user --email admin@example.com --name "Administrator" --role admin
```

Assign an issued policy to an existing registered patient (example terms must be replaced with actual insurer-approved values):

```powershell
npm run provision --workspace server -- policy --email patient@example.com --name "Issued Family Policy" --coverage 1000000 --premium 12499 --start 2026-01-01 --end 2026-12-31 --due 2026-12-01
```

Provisioning creates audit entries. It does not issue an insurance contract or validate insurer agreements. Administrators can also import issued policy records through the Policies page without stopping the server. Connected-workspace members cannot authorize their own cover; there is no self-service purchase or arbitrary role selection.

## Importing policies

`POST /api/policies/import` accepts either `{source: "sample"}` or `{policies: [...]}`. In the JSON demonstration workspace, a patient can import two clearly labelled sample policies or CSV policy records into their own account. Sample import is idempotent: repeating it returns the same policies with `importedCount: 0`. Hospital staff and claim officers cannot import. In a connected MongoDB workspace, only an administrator can import and assign policies.

Each policy row requires `policyNumber`, `name`, `coverageAmount`, `premiumAmount`, `startDate`, `endDate`, and `nextDueDate`. An administrator must also provide `patientEmail`, matching an existing patient account. Member imports either omit `patientEmail` or provide their own email. Policyholder identity, active status, zero initial used coverage, IDs, billing period and audit entries are set by the server; supplied ownership or status fields are ignored.

Imports accept 1–100 rows. Amounts are positive INR values with at most two decimal places (coverage up to 100,000,000 and premium up to 10,000,000). Dates use YYYY-MM-DD; the end follows the start, and the premium due date falls within the cover period. Duplicate policy numbers are rejected case-insensitively across both the uploaded batch and existing records. Validation and assignment are atomic: no partial import occurs when a row is invalid. A successful response is `{policies, importedCount, source}` with HTTP 201, or HTTP 200 for an already-imported sample set. Each new policy creates a `POLICY_IMPORTED` audit record.

Demo imports carry `sample: true`. These records can use sandbox or Razorpay test payments but cannot collect live payments. Importing records does not verify an insurance contract with an insurer.

## Authorization and API

All `/api` paths except health, login, registration and the signed gateway webhook require `Authorization: Bearer TOKEN`. Patients access only their own claims, policies, documents and payments. Hospital staff see all sample claims/policies and submit on behalf of patients, then edit/upload only to their own pending submissions. Officers and admins review pending claims. Finalized decisions cannot be overwritten. Admin has submission/edit privileges, too. Audit access is officer/admin only. Premium payment is restricted to the policyholder. APIs return `{message}` on error.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/health` | `{status, mode, payments, paymentMode}` |
| POST | `/api/auth/login`, `/api/auth/register` | `{token, user}` |
| GET | `/api/auth/me` | `{user}` |
| PUT | `/api/auth/profile` | `{user}`; accepts name, phone |
| GET/POST | `/api/claims` | `{claims}` / `{claim}` |
| GET | `/api/claims/stats` | `{stats}` for authorized records |
| GET/PUT | `/api/claims/:id` | `{claim}` |
| POST | `/api/claims/:id/documents` | `{claim}` |
| GET | `/api/documents/:id` | Protected file download |
| GET | `/api/policies` | `{policies, importOptions: {sample, csv}}` |
| POST | `/api/policies/import` | `{policies, importedCount, source}`; permitted member-demo or admin import |
| GET | `/api/payments` | `{payments}` |
| POST | `/api/payments/order` | `{order, provider, paymentMode, keyId?}` |
| GET | `/api/payments/orders/:id` | Owner-only gateway status reconciliation; `{order, status, payment, policy, paymentMode}` |
| POST | `/api/payments/verify` | `{payment, policy}` |
| POST | `/api/payments/webhook` | `{received}` after HMAC verification |
| GET | `/api/audit` | `{logs}` |

Claim POST accepts JSON or multipart (`documents` file field, max 5 files/request, 5 MB/file, max 10/claim; PDF, JPEG, PNG with header validation). Required fields: policyNumber, age (0–120 integer), gender (Male/Female/Other), claimAmount (INR), disease, hospital, admissionDate and dischargeDate (YYYY-MM-DD). Optional previousClaimHistory. Patient identity/status/timestamps are set by the server. PUT edits pending claims using these same fields, or reviewers pass `{status: "Approved"|"Rejected", remarks}`. Remarks require 5–2000 characters. Approval atomically checks and updates available policy coverage.

## Payment integration

Without keys, development mode offers an explicitly labelled sandbox that moves no money. `ALLOW_DEMO_PAYMENTS=false` disables it. When both `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are present, the server creates Razorpay Orders using its stored policy premium, returns only the public key and order information, and verifies the checkout signature server-side. It also fetches the payment from Razorpay and requires a matching captured amount, currency and order before recording success. Configure automatic capture in the Razorpay dashboard. An authorized but uncaptured payment receives HTTP 409 and must be retried after capture or reconciled through the webhook.

Frontend verification request: `{orderId: order.id, razorpay_payment_id, razorpay_signature}`. Checkout's gateway order is `order.gatewayOrderId` (also returned as `order.order_id`). Amounts in orders are integer paise; stored policy premiums and receipt amounts are INR. Sandbox checkouts expire after 30 minutes. Before reopening any outstanding gateway checkout, the server reconciles its payment attempts: captured payments settle and return HTTP 409 with the receipt, and authorized payments block another checkout until capture is resolved. Otherwise the same gateway order is reused with a renewed 30-minute local checkout window, including after failed attempts or local expiry. A local timeout does not cancel the gateway order, so creating another chargeable order could allow duplicate charges. Settled orders return their original receipt on repeat verification. One premium per policy billing period may settle, even with concurrent requests. Annual next due date advances on payment. A premium cannot be prepaid more than 90 days ahead. This does not extend the policy contract end date or simulate claim reimbursement payouts.

`paymentMode` is `test` or `live` for Razorpay, `demo` for a simulated payment, and `disabled` in health when no checkout is available. Orders and receipts retain their creation mode. Legacy gateway records with no recorded mode return `unknown`. Pending orders are reused only with the same provider and public gateway key, so switching between sandbox, test and live configurations does not reopen an incompatible checkout.

If the customer closes Checkout or loses the verification response, refresh `GET /api/payments/orders/:id` with the internal order ID and the policyholder's token. The server fetches the order's payment attempts from Razorpay and records only a captured payment matching the stored order, amount and currency. It returns `status: paid` with the original receipt and updated policy, or `pending`, `awaiting_capture`, `failed`, or `expired` with `payment: null`. Local checkout expiry does not discard a captured gateway payment. This endpoint never completes a simulated payment. Failed attempts do not become receipts.

Use hosted Standard Checkout for UPI QR codes on desktop and UPI Intent on supported mobile devices; payment methods must be available on the merchant account. Do not collect a UPI ID or PIN in CareClaim. Razorpay's [UPI documentation](https://razorpay.com/docs/payments/payment-methods/upi/) directs merchants to QR/Intent as the general UPI Collect flow was deprecated from 28 February 2026.

For asynchronous reconciliation, configure `RAZORPAY_WEBHOOK_SECRET` and the public `/api/payments/webhook` endpoint for `payment.captured`. The raw request body is HMAC verified. Webhook and checkout settlement share the idempotent path. Test keys first; live credentials and account activation are required to accept real money. No card numbers, CVV, bank credentials, or gateway secrets are stored in application records.

Implementation follows current official [Standard Checkout integration](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/), [Fetch a Payment API](https://razorpay.com/docs/api/payments/fetch-with-id/), and [Fetch Payments for an Order API](https://razorpay.com/docs/api/orders/fetch-payments/). Live gateway and MongoDB integration cannot be verified without configured infrastructure; automated tests mock Razorpay responses and exercise the JSON adapter.

## Verification

`npm test --workspace server` runs Node integration tests using a temporary database and an ephemeral HTTP server. Tests cover login/register, privilege escalation, password privacy, record ownership, role-filtered statistics, validation, concurrent final decisions, file signatures and protected downloads, sandbox amount tampering, duplicate payment settlement, gateway signature/capture verification, signed-webhook idempotence, disabled checkout, persistence and mutation rollback. Temporary test directories are removed after each test.
