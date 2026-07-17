# PactOS Control Plane

NestJS backend for authentication, agreement metadata, read models, Soroban event indexing, and notifications. It is deliberately non-custodial: wallets sign transactions, and financial decisions remain on-chain.

## Local development

1. Copy `.env.example` to `.env` and set secrets/contract IDs.
2. Run `docker compose up -d`.
3. Run `npm install`, `npm run prisma:generate`, then `npm run prisma:migrate`.
4. Run `npm run dev`; Swagger is available at `/docs` and health at `/v1/health`.

## Event pipeline

`getEvents` RPC → durable `ListenerCheckpoint` → deduplicated `InboxReceipt` → `ContractEvent` projection → transactional `OutboxEvent` → notification/analytics consumers.

This design tolerates at-least-once delivery. Transaction/event coordinates are unique, and the backend must rebuild projections from Stellar evidence after an outage.
