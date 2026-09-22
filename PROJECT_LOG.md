# PROJECT_LOG — Visa Bot (WhatsApp Visa Chatbot)

## Key Decisions & Trade-offs

### 2026-09-21 — Real application flow (multi-step form + summary + payment)

- **Application journey is now a 6-step form:** destination → visa type (options) →
  passport → travel date → name → email. Driven by an ordered `APPLICATION_FIELDS` list
  in `engine.ts`.
- **Raw-text capture:** once in `APPLICATION` state, the user's raw message is captured as
  the answer to the pending field (DeepSeek can't reliably extract name/email/date/visa).
  This is handled in `handleMessage`, not the model.
- **Visa options from catalogue:** the visa question lists numbered options with prices via
  `formatVisaOptions`, and `resolveVisaChoice` resolves a number or exact name back to the
  product. Destination aliases (`UAE`, `dubai`, `uk`) normalize via `normalizeDestination`.
- **Summary + payment:** once all fields are collected, `submitApplication` stores the
  record (stage `awaiting_payment`, with `totalUsd`/`currency`/`paymentUrl`) and the reply
  renders `formatApplicationSummary` + a checkout link built by `buildPaymentUrl`.
- **`PAYMENT_BASE_URL`** added to config (default `https://pay.example.com`).
- **Cancel guard:** `cancel`/`restart`/`reset` resets the form and returns to the menu.
- **Catalogue seeded** with 14 UAE visa types (placeholder prices) + Canada/UK tourist.

### 2026-09-21 — Infrastructure deployed

- **Stack `visa-bot` deployed to `eu-north-1`** via `sam build && sam deploy`.
- **Webhook URL:** `https://zg5x075vu7.execute-api.eu-north-1.amazonaws.com/Prod/webhook`
- **Admin API URL:** `https://itttp409fi.execute-api.eu-north-1.amazonaws.com`
- **Seeded 16 products** (14 UAE visa types + Canada/UK tourist) into DynamoDB.
- Secret parameters have empty defaults so the stack deploys in stub mode before Meta/DeepSeek
  credentials exist.

### 2026-09-22 — Pivoted to Telegram (channel abstraction)

- **Added a `channel` field** to `NormalizedMessage` (`whatsapp` | `telegram`) so the
  engine/DeepSeek/DynamoDB stay channel-agnostic. Only the intake + outbound adapters differ.
- **New Telegram adapter:** `telegram/schemas.ts` (normalize update), `telegram/client.ts`
  (sendMessage), and a `telegram-webhook` Lambda (POST → normalize → enqueue).
- **Outbound dispatches by `channel`** — WhatsApp and Telegram senders coexist; WhatsApp can be
  re-enabled later without touching the engine.
- **Why Telegram:** WhatsApp/Meta blocked by account breach + business verification. Telegram
  needs only a BotFather token — free, no verification, ideal for a working POC.
- **Deploy script now requires `TELEGRAM_BOT_TOKEN`** in `.env`.

## Key Learnings

- Fast webhook ack is mandatory — do verification/dedupe/enqueue only in the webhook Lambda.
- `EVENT#<meta_id>` conditional put is the idempotency guard against Meta duplicate deliveries.
- **SAM + esbuild gotchas:** `Metadata` (BuildMethod esbuild) must be a resource-level
  sibling of `Properties`, NOT inside `Properties` and NOT in `Globals`.
- `Globals.Function.Environment` gets **replaced** (not merged) by function-level
  `Environment`, so shared vars must be repeated per function.
- SAM's esbuild builder needs esbuild on the **PATH** — install it globally
  (`npm i -g esbuild`); the devDependency alone isn't found during the isolated build.
- AWS account default region is `eu-north-1`, not `us-east-1`.

## Quick reference

| Concern  | Choice                                             |
| -------- | -------------------------------------------------- |
| Language | TypeScript (Node 20)                               |
| Runtime  | AWS Lambda (arm64)                                 |
| HTTP     | API Gateway (REST for webhook, HTTP API for admin) |
| Queue    | SQS (inbound + outbound, each with DLQ)            |
| Database | DynamoDB (single table, PAY_PER_REQUEST, TTL)      |
| AI       | DeepSeek (`deepseek-chat`, JSON mode)              |
| IaC      | AWS SAM (esbuild) — region eu-north-1              |
| Tests    | Vitest                                             |
