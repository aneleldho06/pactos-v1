# PactOS Technical Architecture Specification

**Status:** Proposed production blueprint  
**Scope:** Architecture only; no application, backend, or Soroban implementation code.

## 1. Product philosophy

PactOS is the execution layer for financial intent on Stellar. A payment should enact the agreement attached to it, not merely change a balance. Its central primitive is an immutable, versioned Agreement written in a constrained Agreement Definition Language (ADL). The Agreement Runtime Engine (ARE) coordinates triggers and settlement; Soroban contracts alone authorize money movement.

| Principle | Decision and rationale |
|---|---|
| On-chain authority | Contracts own funds, roles, and state transitions, so a database cannot move assets. |
| Explicit intent | ADL, inputs, and compiler manifest are immutable and reproducible. |
| Off-chain orchestration | Services index, schedule, notify, and relay; contracts decide. |
| Facts first | Durable events drive projections and commands are idempotent. |
| Safe composition | Audited primitives replace arbitrary user programs. |
| Replaceable operations | Direct wallet invocation remains possible if PactOS is unavailable. |

## 2. High-level architecture

~~~mermaid
flowchart TB
  Client["Next.js and React client"] --> API["API Gateway and BFF"]
  API --> Services["Domain services"]
  Services <--> Data["PostgreSQL, Redis, S3, BullMQ and event bus"]
  Services --> ARE["Agreement Runtime Engine"]
  ARE --> Contracts["Soroban contracts"]
  Contracts --> Stellar["Stellar Network"]
  Client <--> Wallet["Stellar wallet"]
  Wallet --> Stellar
~~~

| Layer | Responsibility | Why |
|---|---|---|
| Client | Authoring, local simulation, read models, signature prompts. | User credentials remain local. |
| API | REST, auth, idempotency, limits, response shaping. | Stable public interface despite internal evolution. |
| Services | Metadata, templates, projections, notifications, analytics. | Separate retention/scaling from settlement. |
| ARE | Trigger, validate, plan, authorize, submit, reconcile. | Dedicated reliability boundary for the control plane. |
| Contracts | Escrow, permissions, deterministic transitions. | The financial trust boundary. |
| Stellar | Canonical ordering and transaction evidence. | Settlement consensus is not reinvented. |

## 3. Core system components

| Component | Responsibility |
|---|---|
| Agreement Runtime Engine | Deduplicates triggers, leases work, creates canonical plans, coordinates authorization, and reconciles chain facts. |
| Rule Engine | Evaluates deterministic ADL predicates and selects legal transitions; never authorizes value transfer. |
| Agreement Registry | Owns drafts, immutable versions, participants, activation metadata and contract mappings. |
| Template Engine | Publishes reviewed parameterized ADL templates, schemas, constraints and compatibility metadata. |
| Execution/Relayer | Builds invocation payloads, applies sponsorship policy, submits and tracks transactions. |
| Blockchain Listener | Streams Stellar/Soroban ledger and contract events using durable checkpoints. |
| Event Bus | Transactional outbox, consumer groups, DLQ and replay. |
| Wallet Service | Verifies wallet challenges and sessions; never receives private keys. |
| Notification, Analytics, Audit | Delivers events, builds privacy-aware aggregates, and hash-chains evidence. |
| Treasury Service | Reconciles disclosed protocol fees and sponsored-fee budgets. |

## 4. Trust boundaries

| Boundary | Trusted to do | Must never do |
|---|---|---|
| Soroban contracts | Hold escrow, enforce rules and roles, emit canonical facts. | Trust backend state to authorize a transfer. |
| Client and wallet | Display intent and make explicit signatures. | Treat cache as final or expose signing keys. |
| Backend and relayer | Index, schedule, notify and submit bounded invocations. | Custody private keys or bypass contracts. |
| PostgreSQL, Redis, S3 | Store projections, queues and artifacts. | Act as a financial source of truth. |

A mismatch is repaired from chain evidence. No financial authority is duplicated off-chain.

## 5. Domain model

| Entity | Purpose, relationship, lifecycle/ownership |
|---|---|
| User and Wallet | User links Stellar public keys. Wallet moves from linked to verified to revoked; holder owns signing authority. |
| Agreement | Arrangement with versions, participants, triggers and executions. Draft to activation-pending to active to paused/completed/cancelled. |
| AgreementVersion | Immutable ADL, compiler version, content hash, inputs, contract manifest; sealed on publish. |
| AgreementTemplate | Parameterized reviewed definition: draft, review, published, deprecated. |
| Participant and Rule | Participant is a role-bearing wallet; Rule is an immutable ADL node of a version. |
| Trigger, Execution, Transaction | Trigger is observed then consumed/expired; execution is planned, authorized/submitted, settled/failed/retryable; transaction is immutable ledger evidence. |
| Approval | Decision bound to version/action/nonce/expiry: pending, granted, rejected, expired. |
| Asset, Notification, AuditLog | Chain-verified catalog; queued delivery; append-only hash-chained evidence. |

One agreement has many versions but only one active version. Every execution pins one exact version and trigger; every settled action maps to contract events and a Stellar transaction hash.

## 6. Agreement Runtime Engine

Lifecycle: observe normalized trigger; atomically deduplicate using source, source identifier, agreement, and version; acquire a lease; validate agreement status, roles, approvals, assets, ledger conditions and ADL constraints; compile canonical plan; obtain wallet authorization or use a contract-permitted relayer; submit; confirm matching chain events; finally project notifications, webhooks, audit and analytics.

~~~mermaid
stateDiagram-v2
 [*] --> Detected
 Detected --> Planned: unique trigger and validation
 Detected --> Ignored: duplicate or ineligible
 Planned --> AwaitingSignature: signature required
 AwaitingSignature --> Submitted: valid authorization
 AwaitingSignature --> Expired
 Planned --> Submitted: relayer permitted
 Submitted --> Confirmed: matching ledger event
 Submitted --> Retryable: temporary uncertainty
 Retryable --> Planned: backoff and revalidate
 Submitted --> Failed: terminal rejection
~~~

Plans use version-pinned ADL, normalized evidence, ledger time/sequence, state and explicit approvals. Canonical ordering and integer units produce a digest; contracts repeat authoritative validation. Delayed jobs are hints: wake-up always rechecks chain state. Lease reapers recover abandoned work. Retried transport failures use jittered bounded backoff; unknown submissions remain submitted until ledger lookup resolves them.

~~~mermaid
sequenceDiagram
 participant L as Listener or Scheduler
 participant R as Runtime
 participant D as Database and Outbox
 participant W as Wallet or Relayer
 participant K as Soroban
 L->>R: Trigger detected
 R->>D: unique execution and lease
 R->>R: validate and compile plan
 R->>W: authorization or submission request
 W->>K: invoke transition
 K-->>L: ledger event
 L->>R: execution confirmed
 R->>D: settle and publish facts
~~~

## 7. Agreement Definition Language

ADL is typed, declarative, canonical JSON and intentionally non-Turing-complete. It forbids loops, floating point, arbitrary external calls and dynamic recipients. It supports WHEN, IF, WAIT, SPLIT, TRANSFER, CONVERT, ESCROW, APPROVE, REJECT, RETURN, NOTIFY and END.

~~~ebnf
agreement = AGREEMENT identifier version participants trigger block END ;
trigger = WHEN (FUNDS_RECEIVED asset | AT timestamp | APPROVAL role) ;
statement = condition | wait | split | transfer | convert | escrow | approval | return | notify ;
condition = IF predicate THEN block [ELSE block] ;
~~~

Amounts are integer base units and allocations are basis points, required to total 10,000. Validation passes: schema/type; semantic role, asset and reachability; policy limits/features; contract compatibility. Compilation produces canonical AST/hash, bounded graph, required modules/storage versions, invocation schemas, and a human explanation. ADL uses semantic versioning and every agreement stores its compiler manifest. CONVERT is feature-gated until an audited bounded liquidity adapter and price/slippage policy exist.

## 8. Event-driven architecture

Use transactional outbox and consumer inbox receipts. Delivery is at-least-once; financial business effects are effectively-once. Partition runtime events by agreement ID.

| Events | Producer | Consumers |
|---|---|---|
| Agreement Created, Updated, Version Published | Registry | Runtime, audit, analytics |
| Agreement Activated, Paused, Cancelled | Contract listener | Runtime, notifications |
| Funds Received, Released, Returned, Escrowed | Listener | Runtime, treasury, analytics |
| Trigger Detected; Execution Planned, Started, Submitted, Completed, Failed | Runtime/listener | Views, webhook, audit |
| Approval Requested, Granted, Rejected, Expired | Runtime/listener | Runtime, notifications |
| Template Published/Deprecated; Webhook Delivered/Failed | Template/notification | Cache, audit, support |

Every envelope has immutable ID, type, schema version, time, producer, aggregate, correlation and causation IDs, idempotency key and ledger evidence.

## 9. Backend services

| Service | Scaling and failure handling |
|---|---|
| Gateway/BFF | Stateless replicas; retry-safe errors; no direct domain table writes. |
| Identity | Postgres plus Redis sessions; one-time nonce consumption is atomic. |
| Registry/Template | API/event owned; read replicas/CDN; publishing is transactional. |
| Runtime | Agreement-hash-sharded workers; leases expire and recover safely. |
| Execution/Listener | Independent pools; persist intent before sending; durable cursor and replay. |
| Notification | Rate-limited queues, retry/DLQ and signed replay log. |
| Audit/Analytics | Asynchronous, never blocks settlement, backfilled from facts. |

Use Node.js/TypeScript modular workloads in a monorepo. Listener, runtime and relayer are isolated from day one because their permissions and incident modes differ from CRUD.

## 10. Database architecture

~~~mermaid
erDiagram
 USERS ||--o{ WALLETS : links
 USERS ||--o{ AGREEMENTS : creates
 AGREEMENTS ||--o{ AGREEMENT_VERSIONS : has
 AGREEMENTS ||--o{ PARTICIPANTS : includes
 AGREEMENTS ||--o{ TRIGGERS : receives
 TRIGGERS ||--o| EXECUTIONS : initiates
 EXECUTIONS ||--o{ TRANSACTIONS : submits
 AGREEMENTS ||--o{ APPROVALS : collects
 AGREEMENTS ||--o{ AUDIT_LOGS : records
~~~

Tables: identity (users, wallets, sessions); agreement (agreements, agreement_versions, participants, rules); runtime (triggers, executions, attempts, approvals, schedules); chain (checkpoints, transactions, contract_events); platform (outbox, inbox, audit, notifications, webhook deliveries, idempotency).

Use unique wallet keys, contract addresses, trigger keys, transaction hashes and ledger-event coordinates; indexes on execution status/next attempt and agreement/sequence. PostgreSQL is off-chain truth. Use short row locks or SKIP LOCKED for leases and optimistic versions for edits. Redis is cache, rate limit, session and queue backing only. Partition chain/audit monthly; retain hot data 24 months, archive immutable encrypted partitions to S3/warehouse, and use point-in-time recovery with tested restores.

## 11. API architecture

Public REST/JSON is versioned at /v1 and governed by OpenAPI-generated SDKs. Gateway owns authentication, content limits, correlation and idempotency. Use opaque cursor pagination with stable created-time/id ordering and allowlisted filters.

Representative resources: auth challenge/verify; agreement create/list/detail/version/activate/pause; templates; execution detail/authorization; approval grant/reject; webhook endpoint/delivery. Monetary values are base-unit strings with asset metadata and timestamps are RFC 3339 UTC. Errors are RFC 9457-style problem objects with PactOS code, correlation ID and retry guidance. Additive changes are compatible; breaking changes use /v2.

Internal services use workload identity or mTLS, schemas, deadlines and circuit breakers. Webhooks are timestamped and signed with rotating per-endpoint secrets, retry/DLQ policy and bounded replay. Wallet login signs a one-time domain-separated challenge containing origin, network, nonce and expiry; it is never transaction authorization.

## 12. Smart contract architecture

| Module | Authoritative responsibility |
|---|---|
| Registry | Version hash/configuration, lifecycle and module addresses. |
| Runtime | Trigger, nonce, role, approval and state-transition validation. |
| Escrow | Holds assets and releases only after runtime authorization. |
| Distribution | Bounded integer allocations. |
| Permissions | Roles, thresholds, delegation and guardian authority. |
| Treasury | Explicit protocol fees and governed withdrawal. |
| Audit | Emits/hash-anchors significant evidence. |

Interfaces are narrow and versioned. Default agreement references are immutable; alternatives are governed timelock or participant-consented migration. Pause blocks new automatic releases but cannot seize assets, alter roles or bypass returns.

## 13. Security architecture

| Threat | Control |
|---|---|
| Backend/relayer compromise | Contract authorization, version/nonce/digest binding, explicit signatures. |
| Replay/duplicate delivery | On-chain consumed triggers/nonces; database unique keys; outbox/inbox dedupe. |
| Signature misuse | One-time domain-separated login challenges; separate transaction payloads. |
| ADL ambiguity | Canonical AST/hash, fixtures/pinning, contract revalidation. |
| Unauthorized action | On-chain roles/thresholds, expiry approvals, least privilege. |
| Listener gap | Durable cursor, replay and state reconciliation. |
| API/webhook abuse | WAF, quotas, signed payloads, SSRF-safe delivery. |
| Contract flaw/secrets | Audits, property tests, caps/timelocks/bug bounty; managed secrets/rotation. |

Audit is append-only and hash-chained. Agreement guardians may pause under policy; protocol guardians may halt new automatic releases in severe incidents. Neither may redirect user assets. All pauses carry reason, event, review/expiry and governed unpause.

## 14. Scalability

| Scale | Posture |
|---|---|
| 10 users | Managed Postgres/Redis, one region, modular deployments, durable outbox and observability. |
| 1,000 users | Separate API/runtime/listener/notification pools, read replicas and autoscaling. |
| 100,000 users | Partition chain data, agreement-hash workers, consumer groups, multi-AZ and active/passive listener. |
| Millions of agreements | Compact chain state, archived inactive views, partitioned registry/runtime and cold history. |
| Millions of executions | Autoscaled idempotent workers, ledger-aware backpressure, per-agreement ordering, adaptive relayers and bounded fan-out. |

Ledger transaction capacity is likely the bottleneck. Batch only when agreement isolation is preserved and expose settlement/fee state explicitly.

## 15. Deployment architecture

Development uses Docker Compose, fixtures and Stellar testnet. Staging is isolated production-shaped Kubernetes/testnet for migrations, replay, load and incident drills. Production uses multi-AZ Kubernetes-ready stateless workloads plus managed HA Postgres, Redis, queues, S3 and secrets; applications deploy canary/blue-green and contracts have separately gated multisignature release.

GitHub Actions gates lint/types/tests, contract invariants, ADL fixtures, dependency/license/SAST/container/IaC scans, migrations, signed artifacts/SBOM and staged approval. OpenTelemetry links request, event, execution, transaction and agreement IDs. Alert on listener lag, queue age, recovery, confirmation latency, financial invariants and webhook failures. Maintain runbooks for listener stalls, unknown transaction, poison jobs, RPC outage, key rotation and pause.

## 16. Production monorepo

~~~text
apps/{web,api,worker-runtime,worker-listener,worker-notifications}
packages/{adl,domain,api-contracts,db,stellar,observability,config}
contracts/{registry,runtime,escrow,distribution,permissions,treasury,audit,interfaces,test-fixtures}
backend/services/
shared/fixtures/
docs/architecture/
scripts/
infra/{docker,kubernetes,terraform,github-actions,monitoring}
~~~

This exposes deployable boundaries while centralizing typed contracts and fixtures. Contracts remain independently auditable and never import application concerns.

## 17. Architecture decision records

| ADR | Decision | Alternative/trade-off | Reason |
|---|---|---|---|
| 001 | Soroban is financial truth. | Off-chain is easier but custodial. | Eliminates duplicated money authority. |
| 002 | Constrained declarative ADL. | Arbitrary programs are flexible but unsafe. | Auditable deterministic composition. |
| 003 | Event outbox architecture. | Sync chains/direct publish lose resilience. | Replayable independent projections. |
| 004 | Postgres truth; Redis non-authoritative. | Redis-only risks loss; full event sourcing is premature. | Strong transaction/recovery model. |
| 005 | At-least-once transport, effectively-once effects. | Exactly-once is impractical. | Nonces/unique keys make replay safe. |
| 006 | Wallet challenge auth; no custody. | Custody changes risk/compliance. | Stellar-native ownership. |
| 007 | Isolate listener/runtime/relayer. | Monolith shares failure modes. | Independent permissions/scaling. |
| 008 | Immutable agreement references, narrow pause. | Upgradeability weakens predictability. | Financial terms stay stable. |
| 009 | REST/OpenAPI public, RPC internal. | GraphQL adds complexity. | Stable SDK-friendly surface. |
| 010 | Kubernetes-ready managed state. | Self-hosting raises operations. | Focus team on protocol correctness. |

## Production acceptance invariants

1. No asset leaves escrow without contract-authorized transition.
2. Every settled execution has one exact version and canonical transaction evidence.
3. Duplicate triggers cannot produce duplicate financial effects.
4. Backend loss cannot create unauthorized transfer.
5. Replay rebuilds projections from events and chain evidence.
6. Privileged actions are attributable and exportable.
7. Emergency pause cannot become an emergency seizure mechanism.

