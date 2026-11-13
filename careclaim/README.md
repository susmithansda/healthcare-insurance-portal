# CareClaim

A MERN medical claim management application built from the supplied **Medical Mediclaim Management & Visualization System** specification. It brings role-based claim submission and review, health policies, supporting documents, analytics, and premium payments into one responsive workspace.

The project includes a ready-to-run synthetic-data demonstration and a MongoDB-backed server. The optional hosted Site is a **browser preview** of the interface; the complete Express/MongoDB application runs from this repository. Hosting has not been published: automatic approval review requires permission to upload the project source.

## Start locally

Use Node.js 24 or later and npm. From this `careclaim` folder:

On Windows, you can also double-click **Start-CareClaim.cmd** to install missing dependencies and start both servers.

```powershell
npm install
npm run dev
```

Open the Vite URL printed in the terminal, normally **http://127.0.0.1:5173**. The API runs on port **4000**; Vite proxies `/api` to it. No database account or payment credentials are needed for the demonstration. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

The first API start creates synthetic records in `server/data/database.json` and a local JWT signing secret. Files survive server restarts. Stop both servers with Ctrl+C.

To build the interface and serve the app through Express:

```powershell
npm run build
npm start
```

Then open **http://localhost:4000**. This still uses development/demo settings unless `NODE_ENV=production` is set.

## Demo accounts

Each account uses **`Demo@12345`**.

| Role | Email | Capabilities |
| --- | --- | --- |
| Patient | `patient@careclaim.demo` | Own claims, documents, policies and premium payments |
| Hospital staff | `hospital@careclaim.demo` | View claims and policies, submit on behalf of patients, edit own pending submissions |
| Claim officer | `officer@careclaim.demo` | View claims, approve or reject pending claims, view analytics and audit history |
| Administrator | `admin@careclaim.demo` | View and review all claims, submit claims, edit pending claims, view audit history |

Public registration always creates a patient. Role assignment is restricted to the operator CLI. A newly registered patient starts with no policies. In the demonstration, members can import sample policies or a policy CSV. In a connected workspace, an administrator imports and assigns issued policy records, or an operator uses the provisioning CLI.

## What is implemented

- JWT authentication, bcrypt password hashing, authenticated documents, and server-side role checks.
- Claim creation with validation, supporting medical bills, search, status filters, sorting, pagination, pending-claim editing, and reviewer decisions with mandatory remarks.
- A dated claim timeline and an audit trail of submissions, decisions, payments, and profile changes.
- Policy cards with coverage usage, premium amounts and due dates.
- Sample-policy and CSV import from My policies or the empty claim form, with downloadable templates, validation, duplicate protection and saved claim details.
- Status and gender doughnut charts, patient claim amounts, age-group trends, and claim activity charts.
- CSV exports, print-friendly reports and payment receipts.
- A medical blue, white and slate workspace with a navy dark theme, policy selection, UPI/card/netbanking preferences, payment search, receipts and CSV exports. Light mode is the default for new visitors; saved theme preferences are preserved.
- Premium checkout with a visible sandbox and an optional Razorpay gateway integration, explicit test/live labels, and payment-status recovery after an interrupted checkout.
- A document library for claim-linked PDF, PNG and JPEG uploads. Each request accepts up to five files of 5 MB each, with up to ten documents per claim. File signatures are checked.
- A photographic welcome screen and dashboard featuring a fictional doctor and patient, plus a muted autoplay welcome video, gentle animation and optional ambient audio. The sign-in page attempts low-volume audio automatically when browser policy permits it, with explicit sound and animation controls. Reduced-motion preferences keep welcome media still and quiet. The care corner retains its original explainer and ambient music.
- Responsive layouts, keyboard-accessible controls, and reduced-motion settings.

## Runtime modes

| Mode | How it starts | Data and authentication |
| --- | --- | --- |
| Server demo | Run the API without `MONGODB_URI` | Persistent JSON synthetic data, real Express authorization and signed JWTs |
| MongoDB | Set `MONGODB_URI` | Mongoose collections, indexes and transactional writes |
| Browser preview | The static frontend cannot reach `/api/health` | Synthetic records in browser storage; uploads in IndexedDB; simulated accounts and checkout |

The interface labels its active mode. Browser preview is for exploring the application with sample data. Its account handling is a simulation inside the browser: **do not enter real medical records, personal passwords or payment information there**. It cannot contact MongoDB, charge money or provide server-enforced access control. Once the client finds a working API, failed API requests are reported rather than silently switching to preview mode.

## Import policies

If the claim form's policy dropdown is empty, choose **Import policies → Import sample policies**. Two clearly labelled sample plans link to your member account, and the form keeps your entered details and selects the first imported plan. Sample imports are available in the JSON demonstration and browser preview. Repeating a sample import does not duplicate policies.

For CSV records, open **My policies → Import policies → CSV file**, download the template, and upload the completed CSV. Required columns are `policyNumber,name,coverageAmount,premiumAmount,startDate,endDate,nextDueDate`. Use at least three characters for the policy number, positive INR amounts with up to two decimal places, and YYYY-MM-DD dates. Imports accept up to 100 records or 256 KB and reject the entire batch if any record is invalid or duplicated.

In the connected MongoDB workspace, CSV import is an administrator action. Each row must also include `patientEmail` for an existing member. Importing a record does not verify insurance with an insurer. Demonstration imports are marked as samples and cannot collect live gateway payments.

To reset the server demonstration, stop the API and remove only the generated `server/data` folder after preserving any uploads you want to keep. To reset the static preview, clear this site's browser storage. Clearing IndexedDB deletes its uploaded preview documents.

## Configure MongoDB and payments

Copy `server/.env.example` to `server/.env`. The npm workspace commands start the server from its own folder, so that file is loaded automatically.

```dotenv
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
MONGODB_URI=mongodb://127.0.0.1:27017/careclaim?replicaSet=rs0
JWT_SECRET=your-generated-secret-of-at-least-32-characters
SEED_DEMO=true
ALLOW_DEMO_PAYMENTS=true
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

Use a **MongoDB replica set**, including for local Mongo development. The store uses transactions to keep claim approval, coverage usage and payment records consistent. MongoDB Atlas replica-set deployments also support these operations. The included server currently caches records in memory: run **one API process/replica**. Supporting multiple API instances requires a shared coordination or direct-query storage design.

Generate a signing secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Razorpay checkout is enabled when both server-side gateway keys are set. Begin with the merchant account's **test keys**. The API creates the order using the policy's stored premium, verifies the returned signature, checks capture and amount with the gateway, and records the payment once. The client only loads Razorpay's hosted checkout; it does not collect card details or receive the key secret. The confirmation API uses the internal `order.id`; Razorpay checkout uses `order.order_id`.

Select a policy and a preferred payment method on **Payments**, then review the premium before continuing. Razorpay opens with that method first and keeps other merchant-enabled methods available. In test mode, Razorpay supports test UPI IDs such as `success@razorpay`; live UPI QR and app/Intent payments require live mode. The gateway controls the final QR and payment details. Never enter a UPI PIN in CareClaim. See [Razorpay checkout testing](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/). Merchant checkout styling can be configured in the Razorpay Dashboard; CareClaim supplies the medical blue accent and navy backdrop.

If checkout closes or confirmation is interrupted, use **Refresh status**. CareClaim checks the order with Razorpay and recovers a captured payment without charging again. Pending checkout references survive a page reload in the same browser. Receipts and exports label sandbox and Razorpay test transactions. Premium amounts come from the policy; this flow does not accept arbitrary donations or process insurer claim payouts.

With no gateway keys, sandbox checkout is available only when allowed in non-production mode. It records a sample receipt and changes the next due date; it does not transfer money. A successful payment is a policy-premium record, not a claim payout. Claim disbursements are outside this implementation.

If a webhook secret is configured, the optional endpoint is `POST /api/payments/webhook`. Configure the merchant webhook to send `payment.captured`. See [Razorpay Standard Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/) and [webhook validation](https://razorpay.com/docs/webhooks/validate-test/) for merchant setup. Gateway account activation, live keys, public HTTPS and live payment testing must be supplied by the operator.

For a separately hosted client and API, add `VITE_API_URL=https://your-api.example/api` to `client/.env` **before building**, and set the API's `CLIENT_ORIGIN` to the client's exact origin. Vite variables are public: never place JWT or payment secrets in a `VITE_` variable.

## Production and Docker

The server refuses production startup with missing MongoDB configuration, a short/missing JWT secret, demo seeding, or sandbox payments. Set `SEED_DEMO=false` and `ALLOW_DEMO_PAYMENTS=false` explicitly. Production does not include public default accounts. Use the provisioning commands in [server/README.md](server/README.md) to create staff accounts and assign policies to registered patients. Stop the API before running provisioning, then restart it to load the changes.

The root `.env.example` is for Docker Compose. Copy it to `.env` and fill in a generated `JWT_SECRET`; add gateway keys if premium payments should be enabled. Then:

```powershell
docker compose up --build -d
```

The compose file starts a single-node MongoDB replica set and the application at **http://localhost:4000**. MongoDB is on the internal Docker network. Named volumes preserve database records and uploaded documents. The Docker configuration is provided for local deployment; Docker availability and container execution depend on the host.

Use HTTPS, managed secrets, backups, suitable document scanning, monitoring and an institution-approved privacy/compliance process before handling real health information. This project does not assert regulatory certification. Multi-instance scaling and third-party insurer/payout integrations remain separate deployment work.

## Validation

```powershell
npm run build
npm test
npm run test:e2e
```

Backend integration tests cover authentication, validation, role permissions, upload signatures, claim decisions and payment behavior. The browser adapter test covers role-scoped records, unauthorized actions, final claim decisions, priced orders and idempotent sandbox payment confirmation. The `--test-isolation=none` option avoids child-process restrictions in managed environments; regular Node test isolation can also be used outside them.

Browser tests start isolated API and frontend servers on ports 4001 and 5175, with their own synthetic database. They exercise submission, file download, editing, sandbox checkout, receipts, officer review, audit history, mobile navigation, video metadata, and persistent browser preview payments. Six additional isolated payment cases check theme contrast, policy and method selection, keyboard access, mobile checkout, test receipts, retries, cancellation and payment recovery using mocked gateway responses. They use the installed Windows Chrome by default; set `CHROME_PATH` to your browser executable on another system. Chrome testing does not require downloading Playwright browsers. The suite contains **17 backend tests, 7 client checks, and 16 browser journeys**, all passing. Policy journeys cover a newly registered member importing cover, continuing a saved claim, CSV validation and duplicate rejection, decimal premium amounts, and mobile preview persistence. Three additional UI journeys verify welcome photography, muted video autoplay, blocked-audio controls, saved themes, reduced motion and mobile photo layout. MongoDB infrastructure, Docker execution, and live gateway transactions were not available for integration testing.

The submission report is in [docs/PROJECT_REPORT.md](docs/PROJECT_REPORT.md), and an importable API collection is in [docs/CareClaim.postman_collection.json](docs/CareClaim.postman_collection.json).

## Project structure

```text
careclaim/
  client/
    src/App.jsx                  React pages and interaction flows
    src/components/Payments.*    Premium checkout, transaction history and receipts
    src/api.js                   API client and explicit browser preview
    src/components/Experience.*  Video, audio and care corner
    public/media/                Original local media assets
    test/preview-api.test.mjs     Browser preview behavior checks
  server/
    src/app.js                   REST API, authorization and payments
    src/models.js                Mongoose collections and indexes
    src/store.js                 MongoDB / persistent JSON adapters
    src/seed.js                  Synthetic demonstration records
    src/index.js                 Configuration and server entrypoint
    test/                        API integration tests
    .env.example                 Server configuration reference
  shared/                        Policy CSV parsing and shared import validation
  dist/                          Generated React build
  Dockerfile
  docker-compose.yml
  .openai/hosting.json            Private static-preview Site configuration
```

The full REST endpoint reference, operator commands and payment verification details are in [server/README.md](server/README.md). Dependencies are recorded in the npm lockfile. Generated state, uploads, secrets and build output are excluded from Git.
