**Uber Rides Receipt**

A small TypeScript + Vite web app for viewing and exporting Uber ride data and receipts. The project provides UI components to select date ranges, review rides in a table, summarize selections, and generate PDF receipts using utilities in the codebase.

**Key Features**
- **View Rides:** Interactive table of rides with filtering and sorting (`src/components/RidesTable.tsx`).
- **Date Range Picker:** Select ranges to filter displayed rides (`src/components/DateRangePicker.tsx`).
- **Selection Summary:** Quick summary & totals for chosen rides (`src/components/SelectionSummary.tsx`).
- **PDF Export:** Utilities to render ride details to PDF (`src/lib/pdf-utils.ts`).
- **Server API (optional):** Basic backend helpers for Uber data integration live in `server/uber-api.ts`.

**Tech Stack**
- **Frontend:** TypeScript + React + Vite
- **UI:** Small component library under `src/components/ui`
- **Utilities:** `src/lib/uber-queries.ts`, `src/lib/pdf-utils.ts`

**Quick Start (development)**
1. Clone the repo

```bash
git clone https://github.com/kunalagra/uber-rides-receipt.git
cd uber-rides-receipt
```

2. Install dependencies and run the dev server (this project uses Bun)

```bash
bun install
bun run dev
```

3. Open the app in your browser (Vite default): `http://localhost:5173`

**Build & Preview**

```bash
bun run build
bun run preview
```

**Notes on configuration**
 - The `src/server/uber-api.ts` helpers communicate directly with Uber's rider API and perform requests on behalf of a logged-in Uber account. They do not use OAuth; instead the server-side functions currently expect a runtime `cookie` value supplied by the client:
	- `cookie`: the session cookie string for `riders.uber.com` (contains your logged-in session)

 - How this works: the client (browser) obtains the `cookie` value from your logged-in session and passes it to the server functions at runtime. The server uses that credential in the `cookie` request header to fetch activities, trip details, and receipt PDFs.

 - How to obtain the cookie (developer workflow):
	 1. Log in to `riders.uber.com` in your browser.
	 2. Open Developer Tools → Network and inspect a GraphQL or invoice request.
	 3. Copy the `cookie` header value for `riders.uber.com` from the request headers.
	 4. Paste this value into the app's UI or a local configuration when prompted.

 - Security & legal: By using session cookies the app performs actions as your Uber account. Do not share or commit these values. Use only your own account and be aware of Uber's terms of service and privacy implications when programmatically accessing account data.

 - No extra environment variables are required by default for client-side usage. If you adapt the project to run a separate backend process that stores credentials or proxies requests, secure those credentials (use environment variables, secrets manager, and avoid committing them).

**Important Files**
- `src/components/RidesTable.tsx` — rides list UI
- `src/components/DateRangePicker.tsx` — date selection
- `src/components/SelectionSummary.tsx` — totals & summary
- `src/lib/pdf-utils.ts` — PDF generation helpers
- `src/lib/uber-queries.ts` — data-query helpers
- `server/uber-api.ts` — minimal server-side Uber helpers (optional)

**Contributing**
- Open issues or PRs for bugs or feature requests. Keep changes focused and test locally with `bun run dev`.

**License**
- AGPL-3