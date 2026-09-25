# MT5 Smart Market

A full-stack **trading & investment platform** — managed recurring-ROI investment
plans, a multi-asset trading desk, crypto/bank funding with MT5 Smart Market approval,
identity verification, linked wallets, referrals, in-app notifications and a
complete admin console.

## Quick start

```bash
npm install
```

Set `DATABASE_URL` and `DIRECT_URL` in `.env` (Supabase Postgres — see `.env.example`),
then create the schema and seed:

```bash
npm run db:migrate
npm run seed
npm start
```

Open **http://localhost:4000**. `npm start` serves both frontend bundles and the API together.

> **Database:** the app runs on **Supabase Postgres** via Drizzle ORM. `DATABASE_URL`
> is the Supabase *transaction pooler* connection (port 6543); `DIRECT_URL` is the
> *session pooler* (port 5432), used only for migrations. Edit the schema in
> `src/db/schema.js`, then `npm run db:generate && npm run db:migrate`.

## Two frontends + one API

The frontend is split into **two independently deployable bundles**:

| Bundle | Folder | Contains | Served at |
| --- | --- | --- | --- |
| **Public site** | `frontend/site/` | landing page, sign-in, registration | `/`, `/login`, `/register` |
| **Dashboard app** | `frontend/app/` | member dashboard + admin console | `/app`, `/admin` |

Each folder is self-contained — drop it on any static host (Netlify / Vercel /
S3 / nginx). Per-bundle setup is in each folder's `DEPLOY.md`. Locally, the
Express server serves both at the URLs above, so nothing changes for development.

- **`frontend/<bundle>/config.js`** holds `apiBase` and the other bundle's URL.
  Empty by default = same origin. Set them when deploying the pieces to
  different domains.
- **Cross-origin:** if a bundle is on a different domain than the API, set
  `CORS_ORIGINS` (comma-separated origins) in the API's `.env`. Empty = same-origin
  only (default). This is the only server-side setting the split needs.
- A few files are shared (`styles.css`, `core.js`, `i18n.js`, `testimonial-popup.js`,
  `logo.svg`). Edit them in `frontend/app/…` then run `npm run frontend:sync` to
  copy them into `frontend/site`.
- **Auth handoff:** on login the public site redirects to the app with the token
  in the URL fragment (`…/app#t=<token>`); the app picks it up, stores it, and
  cleans the URL — this is what makes a cross-domain split work.

| Portal | URL | Login |
| --- | --- | --- |
| Landing | `/` | — |
| User dashboard | `/app` | `member@mt5smartmarket.com` / `Member@12345` (pre-approved) — or register at `/register` and get MT5 Smart Market approval |
| Admin console | `/admin` | `admin@mt5smartmarket.com` / `Admin@12345` |

Admin and member credentials come from `.env` (`ADMIN_*`, `MEMBER_*`). Rename or
delete the seeded member from the admin console once you have your own accounts.

The only seeded records are the admin account, the platform settings, the four
investment-plan templates and the starter testimonials (all fully editable by the
admin). There are no sample users or transactions. Run `npm run seed` to
(re)create the seed records — it is idempotent.

## Public site

The landing page (`/`) has **Rates** (headline daily rate + tier board, pulled
live from the plans), **About us**, **Testimonials**, and a **Contact us** section
with a message form. A **testimonial pop-up** runs on every page — each quote
shows for 3 seconds, then the next appears after a short gap; the admin manages
the list under **Admin → Testimonials**.

## Sign-up & login

Registration collects **first name, last name, email, phone, date of birth,
country (full A–Z list), account currency (A–Z), account type (Crypto /
Investment / Trading), password + confirm password, and a security question +
answer**. New accounts are created
**pending** — the user cannot sign in until MT5 Smart Market approves the account
(operators handle this under **Pending Accounts** in the console). Forgotten
passwords are recovered via the security question.

## Money movement

- **Users can never credit their own balance.** They *submit* deposits; MT5 Smart
  Market **approves / rejects / cancels** them. Every deposit shows **pending** until approved.
- **Deposits** — pick a crypto rail (BTC, ETH, USDT-TRC20/ERC20, USDC, BNB, XRP,
  SOL, TRX, LTC — ranked, each with an **admin-editable address**, memo, min,
  confirmations and network warning) or a bank transfer. Users enter the amount,
  their sending address, the tx hash, and **upload payment-proof images or PDFs**.
- **Withdrawals** — require **verified identity** (configurable). Amount is
  reserved immediately; on reject/cancel it is **refunded in full**. Fee and an
  optional **per-request maximum** are configurable. Three methods:
  **international bank transfer** (structured fields — account holder, bank,
  bank country from the full A–Z list, account number, SWIFT/BIC or routing,
  IBAN, bank address, reference; the admin sees the full account to pay to),
  **cryptocurrency** (coin + network + address), or a **saved linked wallet**.
- **Status a user sees is only Pending → Processing** (plus Rejected / Cancelled).
  Nothing changes on its own — the MT5 Smart Market desk sets it. Transaction
  notes are not shown to users.
- Only the desk moves balances directly — **add or remove any amount** (ledger
  entry + notification + email alert). Users **cannot trade with a zero balance**.

## Trading, AI bot & email alerts

- **MT5 AI Trading Bot** — from the **AI Trading Bot** tab a user picks a
  **trading duration** (e.g. 1 / 3 / 7 / 14 / 30 days) and a **profit target**
  (e.g. 10–100% of stake), commits a **stake** (locked out of their balance),
  and the bot books trades automatically on a timer (`ROBOT_TICK_MINUTES`, each
  session gated by its own interval, ~120 trades per run). The session
  **auto-completes** the moment the profit target is hit *or* the duration
  ends — whichever comes first — and **stake + net profit** is credited back to
  the balance in one ledger entry (trade P&L is tracked in the session only, never
  double-credited). A session can never lose more than its stake. The user can
  **stop early** to settle immediately.
- **Admin** configures the bot in **Platform Settings → AI trading bot**
  (availability, min/max stake, win rate, duration & profit-target option lists),
  starts a bot for any user from their *Trading* tab, and monitors every session
  under **AI Trading Bots** — profit, stake locked, and a click-through
  **detail modal with the full trade-by-trade breakdown**. Freezing an account
  stops its bot.
- The desk can also **open a position on a user's account**, **adjust an open
  position's running P&L**, and **force-close at the live or a chosen price**.
- **Email alerts** — every deposit/withdrawal decision, balance change, trade
  open/close, robot event and freeze/unfreeze emails the user (and raises an 📧
  in-app notification). Set `SMTP_*` in `.env` to deliver for real; otherwise
  every message is logged to **Admin → Email Log**. Toggle globally in Platform
  Settings.

## User features

Overview · **Portfolio** (equity, allocation, equity trend, holdings) ·
Investment Plans · My Investments · **AI Trading Bot** (choose duration + profit
target + stake, live progress, projected payout, recent bot trades, run history) ·
Trading Desk · Deposit · Withdraw ·
**Transactions** (every row clickable → full detail) · **Linked crypto wallets**
(add / remove; admin can mark verified) · **Identity Verification** (upload
ID/passport images or PDF → admin review) · **Notifications** (bell with unread
count, dismissible top banner, full history) · **Admin pop-up messages** (a modal
the admin sends appears on the dashboard on the next load/poll and stays until
acknowledged) · Referrals · **Profile** (all
personal + address fields, preferred currency, account type, plus a **Sign-in
email & password** card to change the address and password used to log in —
confirmed with the current password) · **Security** (change password, security
question, 2-factor toggle, sign-in history).

Changing the sign-in email checks for clashes, notifies the account, and emails a
warning to the previous address. The session stays valid (the JWT is keyed to the
user id, not the email) — the new credentials are used at the next login.

Amounts everywhere are shown in the user's **preferred currency** (the same list
offered at sign-up).

## Languages

A **language switcher** (`assets/js/i18n.js`, loaded on every page) lets a
visitor read the whole site — landing, sign-up, dashboard and admin console,
including dynamically rendered content — in **30+ languages** (English, French,
Spanish, Portuguese, German, Arabic, Hindi, Chinese, Swahili, Hausa, Yoruba, Igbo,
Amharic, …). It sits in the top nav / topbar (floats bottom-right on the auth
pages). Translation runs through Google's website translation engine; the choice
is stored in the `googtrans` cookie + `localStorage` and re-applied on every load.
On a first visit the site adopts the browser's language automatically if it's one
we support. The company name is never translated (`.brand` is marked
`translate="no"`).

## Admin console — edit anything

Overview · **Pending Accounts** (approve / reject) · **Funding Requests**
(approve / reject / cancel deposits & withdrawals, view proof files) ·
**KYC** (To review / Verified / Rejected / All tabs — every submission and its
uploaded documents are kept **permanently**, viewable any time, and are **not
removed on review or when the account is deleted**) · **Users** (search + a full
editor for every field; **freeze / unfreeze**; **delete** (with full cascade);
**add / remove funds**; a **Trading** tab — trading-account summary, start/stop
the AI bot, open a trade for the user, adjust or close their positions) ·
**Transactions** (view + edit any transaction) · Investments · Trades
(force-close) · **AI Trading Bots** (every session, profit monitoring, trade-by-trade
detail modal) · **Email Log** · Linked Wallets · Investment
Plans (CRUD) · **Crypto Methods** (set addresses, memos, limits, ranking, on/off,
add/remove rails) · **Platform Settings** (fees, limits, KYC requirement, email
alerts, bank details, **AI bot config**) · **Testimonials** (add / edit / hide / reorder — feeds the
site-wide pop-up and the landing page) · **Announcements** (broadcast a quiet
notification to everyone or one user) · **Pop-up Messages** (send a modal message
that pops up on every member's dashboard — or one member's — with an optional
action button; it stays queued until the member taps "Got it", and the list shows
a live *seen X / Y* count with pause / delete) · **My Profile** (the admin's own account —
edit name/phone, and a **Sign-in email & password** card that changes the admin's
login email/password **without asking for the current password**) · Run ROI
accrual on demand.

## Architecture

```
src/
  data/reference.js     countries, currencies, account types, crypto rails (reference data)
  config/               env + paths
  db/schema.js           Drizzle schema (16 tables — Supabase Postgres)
  db/client.js           postgres.js pool + Drizzle instance (from DATABASE_URL)
  db/store.js            Collection API over Drizzle — all(), find(), insert(), update(), …
  db/migrations/         generated SQL migrations (drizzle-kit)
  db/uploads/            uploaded proof / KYC files          (git-ignored)
  middleware/            JWT auth, admin guard, error + upload-error handling
  services/              all business logic — auth, user, admin, ledger, wallet,
                         wallet-link, kyc, file (multer), notification, popup, portfolio,
                         investment, plan, trade, robot, email (nodemailer),
                         market, referral, testimonial, settings, stats
  controllers/           thin request/response glue
  routes/index.js        HTTP surface, auth guards, rate limiting, multipart routes
  jobs/scheduler.js      ROI accrual + trading-robot engines
  app.js                 Express assembly — CORS, static serving of both bundles
frontend/
  site/                  public-site bundle — landing, login, register (+ DEPLOY.md)
  app/                   dashboard-app bundle — member dashboard + admin console (+ DEPLOY.md)
scripts/frontend-sync.mjs   copies the shared files from frontend/app → frontend/site
```

Both bundles are vanilla JS, no build step, one dark design system
(`assets/css/styles.css`).

**Data layer.** Every service reaches storage through `db.<collection>` in
`src/db/store.js`, a thin `Collection` wrapper over Drizzle (`all` / `find` /
`findOne` / `findById` / `insert` / `update` / `updateWhere` / `remove` / `count`).
`find`/`findOne`/`count` accept a `{column: value}` object (compiled to a SQL
`WHERE`) or a predicate function (loads the collection and filters in memory).
Balance changes (`applyBalanceChange`, `mutateBalance` in `ledger.service.js`) run
in a real DB transaction with `SELECT … FOR UPDATE` on the user row.

The brand mark is `assets/img/logo.svg` (a scalable chrome-sphere "5" mark, in
both bundles) — used in every header/sidebar/footer and as the favicon. Replace
it in `frontend/app` and run `npm run frontend:sync`.

The two supplied videos are the other binary assets: `market.mp4` is the landing /
auth hero, `dashboard.mp4` is the edge-to-edge banner on the member dashboard.
The dashboard also embeds **TradingView** advanced charts (Overview + Trading
Desk) loaded from `s3.tradingview.com` at runtime. File uploads are stored on
disk and served only to the owner or an admin.

> Market prices are generated by the built-in feed; connect a real price/liquidity
> provider and brokerage before using this with live funds.
