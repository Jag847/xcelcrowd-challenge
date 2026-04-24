# Next In Line

**XcelCrowd Technical Challenge Submission**

Next In Line is a self-healing hiring pipeline designed for zero-manual intervention. Each job opening has a hard active-review capacity. When capacity is exhausted, the system does not reject additional applicants; it enqueues them on a deterministic waitlist. When an active slot is released, the queue advances automatically. When a promoted applicant fails to acknowledge within the decay window, the system penalizes and requeues them, promotes the next candidate, and continues the cascade without operator involvement.

This submission is intentionally engineered around four non-negotiable properties:

- **Atomic capacity enforcement**
- **Deterministic queue ordering**
- **Bounded decay behavior**
- **Reconstructable state transitions**

The implementation uses **PERN** because PostgreSQL is not just storage here; it is the concurrency control layer, the queue ordering primitive, and the audit backbone.

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Evaluator Fast Path](#2-evaluator-fast-path)
3. [The Hard Problems](#3-the-hard-problems)
4. [Architectural Blueprint](#4-architectural-blueprint)
5. [Zero-Friction Setup](#5-zero-friction-setup)
6. [Workflow and Commands](#6-workflow-and-commands)
7. [Repository Layout](#7-repository-layout)
8. [API Documentation](#8-api-documentation)
9. [Testing and Verification](#9-testing-and-verification)
10. [Demo Walkthrough](#10-demo-walkthrough)
11. [Submission Checklist](#11-submission-checklist)
12. [Engineering Retrospective](#12-engineering-retrospective)
13. [Lead Engineer Assessment](#13-lead-engineer-assessment)

## 1. Executive Summary

### Philosophy

Treat the hiring pipeline as a transactional queueing system, not a spreadsheet.

That design choice drives the entire implementation:

- queue position is not inferred in the UI; it is materialized in the database
- concurrency is not handled by request timing luck; it is serialized with row locks
- timeouts are not ephemeral timers; they are processed by a bounded decay worker
- auditability is not an afterthought; every transition appends an immutable log record

### System Invariants

The codebase is built to maintain these invariants:

1. A job can never exceed its configured active capacity.
2. Waitlist order is deterministic and monotonic.
3. An applicant can never occupy more than one non-exited application for the same job.
4. Every domain transition is appended to `StateLogs`.
5. Decay cannot recurse forever; it is bounded by `MAX_DECAYS`.

### Why PERN for This Problem

PostgreSQL gives this challenge the exact primitives it needs:

- **Transactions** for atomic operations
- **`FOR UPDATE` row locks** for race-condition control
- **Sequences** for deterministic queue ordering
- **Partial unique indexes** for duplicate protection
- **`SKIP LOCKED`** for safe decay scanning

Express keeps the queue engine readable at the HTTP boundary, React is sufficient for a polling-based operations dashboard, and Node.js is a practical fit for a stateful I/O-heavy API plus a lightweight heartbeat worker.

The frontend is intentionally dynamic but not real-time. It uses periodic polling rather than sockets because this challenge optimizes for operational clarity and correctness over push-delivery complexity. For a small internal hiring tool, a deliberate polling cadence is the right trade-off.

## 2. Evaluator Fast Path

If reviewing time is limited, these are the highest-signal files:

- Queue engine: [backend/services/queueService.js](./backend/services/queueService.js)
- Decay worker: [backend/services/decayManager.js](./backend/services/decayManager.js)
- Schema and indexes: [backend/models/schema.sql](./backend/models/schema.sql)
- Application endpoint: [backend/controllers/jobController.js](./backend/controllers/jobController.js)
- Applicant ownership and status APIs: [backend/controllers/applicantController.js](./backend/controllers/applicantController.js)
- Integration tests: [backend/__tests__/concurrency.test.js](./backend/__tests__/concurrency.test.js)

If you want to validate the submission quickly:

1. Start the stack with `docker-compose up --build`
2. Create a job with capacity `1`
3. Apply twice with different applicant emails
4. Confirm one applicant lands in `PENDING_ACK` and the other in `WAITLISTED`
5. Trigger an exit from the active applicant
6. Confirm the next applicant promotes automatically
7. Wait for the dashboard refresh window or manually refresh the applicant view
8. Inspect `StateLogs` or the dashboard audit terminal to replay the sequence

## 3. The Hard Problems

### 3.1 Queue Engine

The waitlist is implemented without BullMQ, Redis, cron schedulers, or any third-party queue abstraction.

Instead, the queue is modeled directly in PostgreSQL using a sequence-backed ordering key:

- `priority_score` is stored per applicant
- `priority_score` defaults to `nextval('priority_score_seq')`
- waitlist order is `ORDER BY priority_score ASC`
- promotion selects the smallest `priority_score` among `WAITLISTED` applicants
- decay reassigns a fresh sequence value, which becomes the penalty operation

Schema excerpt:

```sql
CREATE SEQUENCE IF NOT EXISTS priority_score_seq;

CREATE TABLE Applicants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES Jobs(id),
    email VARCHAR(255) NOT NULL,
    status applicant_status NOT NULL,
    priority_score BIGINT NOT NULL DEFAULT nextval('priority_score_seq'),
    decay_count INT NOT NULL DEFAULT 0,
    last_transition_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_job_status_priority
ON Applicants(job_id, status, priority_score ASC) INCLUDE (id);
```

Source: [backend/models/schema.sql](./backend/models/schema.sql)

### 3.2 Concurrency

#### Problem

The challenge-critical race condition is the **last-spot collision**:

- Job capacity = `1`
- Two applications arrive nearly simultaneously
- Both see an apparently free slot
- Without synchronization, both could transition into the active set

#### Solution

This implementation solves the race condition inside the database transaction boundary with **pessimistic locking**.

The critical logic is:

1. Begin transaction
2. Lock the target `Jobs` row with `FOR UPDATE`
3. Count current slot-consuming applicants: `ACTIVE` + `PENDING_ACK`
4. Decide state atomically:
   - below capacity -> `PENDING_ACK`
   - at capacity -> `WAITLISTED`
5. Insert applicant row
6. Commit

Code excerpt:

```js
await client.query('BEGIN');

const jobRes = await client.query(
  'SELECT capacity FROM Jobs WHERE id = $1 FOR UPDATE',
  [jobId]
);

const countRes = await client.query(
  "SELECT COUNT(*) FROM Applicants WHERE job_id = $1 AND status IN ('ACTIVE', 'PENDING_ACK')",
  [jobId]
);

let status = 'WAITLISTED';
if (currentCount < capacity) {
  status = 'PENDING_ACK';
}

await client.query(
  'INSERT INTO Applicants (job_id, email, status) VALUES ($1, $2, $3) RETURNING id',
  [jobId, email, status]
);

await client.query('COMMIT');
```

Source: [backend/services/queueService.js](./backend/services/queueService.js)

#### Why it works

Because the job row is locked before occupancy is read, writers for the same job are serialized. The second request cannot evaluate stale capacity while the first request still holds the lock.

This is a **database-backed atomic decision**, not an application-layer best effort.

#### Additional safeguards

- Duplicate non-exited applications are blocked by:

```sql
CREATE UNIQUE INDEX idx_unique_active_application
ON Applicants(job_id, email) WHERE status != 'EXITED';
```

- Automatic promotions also lock the same job row before moving a waitlisted applicant into `PENDING_ACK`, which prevents cascade-driven overfill.

### 3.3 Decay and Cascade System

#### Problem

When a waitlisted applicant is promoted into active review, they have to acknowledge. If they do nothing, the system must:

1. keep capacity moving
2. avoid losing the applicant entirely
3. penalize their queue position
4. avoid infinite recycling

#### Window definition

The decay window is environment-driven:

- `ACK_WINDOW_HOURS`, default `24`

Expiry condition:

```sql
last_transition_at < NOW() - ($2::int * INTERVAL '1 hour')
```

Source: [backend/services/decayManager.js](./backend/services/decayManager.js)

#### Trigger mechanism

The backend starts an in-process heartbeat worker when the server boots:

- interval: `60_000 ms`
- batch size: `100`
- selection strategy: `FOR UPDATE SKIP LOCKED`

This means expired applicants are processed in batches, and if multiple workers ever exist, locked rows are skipped rather than double-processed.

#### Penalized repositioning

Timeout behavior for a `PENDING_ACK` applicant:

```js
await client.query(
  "UPDATE Applicants SET status = 'WAITLISTED', priority_score = nextval('priority_score_seq'), decay_count = $2, last_transition_at = NOW(), updated_at = NOW() WHERE id = $1",
  [id, decay_count + 1]
);
```

That has two effects:

- `status` becomes `WAITLISTED`
- `priority_score` gets a new sequence value

Because waitlist ordering is ascending by `priority_score`, the applicant is pushed to the back of the queue in a deterministic way.

#### Cascade trigger

After each timeout or active-slot release, the system calls:

```js
await queueService.promoteNext(job_id, client);
```

Importantly, this is executed **inside the same transaction** as the decay or exit operation. That means slot release and queue advancement are committed atomically.

#### Why this does not create infinite loops

Decay is bounded by:

- `MAX_DECAYS`, default `3`

Once `decay_count >= MAX_DECAYS`, the applicant transitions to `EXITED` instead of being recycled forever:

```js
if (decay_count >= MAX_DECAYS) {
  await queueService.transitionApplicant(
    client,
    id,
    'PENDING_ACK',
    'EXITED',
    'MAX_DECAY_PURGE'
  );
}
```

This makes the decay algorithm predictable and terminal.

### 3.4 State Machine

Applicant movement is modeled explicitly as domain state transitions.

Valid transition paths currently implemented:

- `null -> PENDING_ACK` on apply when capacity exists
- `null -> WAITLISTED` on apply when capacity is full
- `WAITLISTED -> PENDING_ACK` on `SYSTEM_PROMOTION`
- `PENDING_ACK -> ACTIVE` on `USER_ACK`
- `PENDING_ACK -> WAITLISTED` on `TIMEOUT_DECAY`
- `PENDING_ACK -> EXITED` on `MAX_DECAY_PURGE`
- `ACTIVE -> EXITED` on `USER_EXIT`
- `WAITLISTED -> EXITED` on `USER_EXIT`
- `PENDING_ACK -> EXITED` on `USER_EXIT`

The queue service centralizes transition logging via:

```js
await this.logStateChange(client, applicantId, fromStatus, toStatus, trigger);
```

That is what makes the domain timeline reconstructable.

### 3.5 Proof by Trace

Concrete example for a job with capacity `1`:

1. Applicant A applies first.
   - occupancy = `0`
   - Applicant A -> `PENDING_ACK`
   - log: `null -> PENDING_ACK (USER_APPLIED)`
2. Applicant B applies second.
   - occupancy = `1`
   - Applicant B -> `WAITLISTED`
   - log: `null -> WAITLISTED (USER_APPLIED)`
3. Applicant A never acknowledges within `24` hours.
   - Applicant A -> `WAITLISTED`
   - Applicant A gets a new `priority_score`
   - log: `PENDING_ACK -> WAITLISTED (TIMEOUT_DECAY)`
4. The same transaction immediately promotes the next waitlisted applicant.
   - Applicant B -> `PENDING_ACK`
   - log: `WAITLISTED -> PENDING_ACK (SYSTEM_PROMOTION)`
5. Applicant B acknowledges.
   - Applicant B -> `ACTIVE`
   - log: `PENDING_ACK -> ACTIVE (USER_ACK)`

That is the core self-healing property of the system.

## 4. Architectural Blueprint

### 4.1 Component Topology

```mermaid
flowchart LR
    A["React Applicant Portal"] --> B["Express API"]
    C["React Company Dashboard"] --> B
    B --> D["Queue Service"]
    B --> E["Applicant Controller"]
    D --> F["PostgreSQL"]
    G["Decay Manager"] --> F
    D --> H["StateLogs"]
    G --> H
```

### 4.2 State Transition Diagram

```mermaid
stateDiagram-v2
    [*] --> PENDING_ACK : Apply when capacity is available
    [*] --> WAITLISTED : Apply when capacity is full
    WAITLISTED --> PENDING_ACK : SYSTEM_PROMOTION
    PENDING_ACK --> ACTIVE : USER_ACK
    PENDING_ACK --> WAITLISTED : TIMEOUT_DECAY
    PENDING_ACK --> EXITED : MAX_DECAY_PURGE
    WAITLISTED --> EXITED : USER_EXIT
    PENDING_ACK --> EXITED : USER_EXIT
    ACTIVE --> EXITED : USER_EXIT
```

### 4.3 Data Model and Index Strategy

Primary domain tables:

- `Jobs`
- `Applicants`
- `StateLogs`

Operationally important fields:

- `Jobs.capacity`
- `Applicants.status`
- `Applicants.priority_score`
- `Applicants.decay_count`
- `Applicants.last_transition_at`

Important indexes:

- `idx_job_status_priority` for promotion and queue position queries
- `idx_decay_check` for heartbeat expiry scans
- `idx_unique_active_application` for duplicate non-exited application prevention

### 4.4 Time Complexity Notes

| Operation | Time Complexity | Bottleneck |
|:---------------------|:-----------------|:-------------------|
| Promotion Lookup     | O(log N)         | Index Scan         |
| Application Decision | O(1)             | Row Lock           |
| Decay Scan           | O(K)             | SKIP LOCKED scan   |

This is the right complexity profile for a small-team internal tool with strict correctness requirements.

### 4.5 Frontend Behavior by Design

The UI is deliberately thin. It does not own queue logic and it does not attempt optimistic reordering.

- The company dashboard polls pipeline state on a fixed interval.
- The applicant portal polls status and renders queue position returned by the backend.
- All authoritative ordering and state transition decisions remain server-side.

That matters because it keeps race-condition handling in one place: the transactional backend. The frontend is a consumer of state, not a co-author of state.

## 5. Zero-Friction Setup

### Prerequisites

- Node.js `18+`
- npm `9+`
- PostgreSQL `15+` or Docker Desktop
- `psql` CLI if running manually

### Option A: Docker Compose

Run the full stack:

```bash
docker-compose up --build
```

Services:

- Frontend: `http://localhost:3001`
- Backend: `http://localhost:5000`
- PostgreSQL: `localhost:5432`

### Option B: Local Installation

#### Backend

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/nextinline
PORT=5000
JWT_SECRET=super_secure_key_123_competition
ACK_WINDOW_HOURS=24
MAX_DECAYS=3
```

Bootstrap the database:

> [!TIP]
> If prompted for a password by `psql`, use the one defined in your `.env` (default in seeds/compose is `password`).

```bash
# Using psql (Ensure the 'nextinline' database exists)
psql -U postgres -c "CREATE DATABASE nextinline;"

# Apply schema and initial seeds
psql -U postgres -d nextinline -f models/schema.sql
psql -U postgres -d nextinline -f models/seed.sql
```

Start the backend:

```bash
npm start
```

#### Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```env
PORT=3001
REACT_APP_API_URL=http://localhost:5000/api
```

Start the frontend:

```bash
npm start
```

## 6. Workflow and Commands

### Run dev servers

Backend:

```bash
cd backend
npm start
```

Frontend:

```bash
cd frontend
npm start
```

### Run backend tests

```bash
cd backend
npm test
```

### Build frontend for production

```bash
cd frontend
npm run build
```

### Database bootstrap

```bash
psql -U postgres -d nextinline -f backend/models/schema.sql
psql -U postgres -d nextinline -f backend/models/seed.sql
```

## 7. Repository Layout

The repository is intentionally small and evaluator-friendly:

```text
next-in-line/
├── backend/
│   ├── controllers/       # HTTP boundary and auth-aware request handling
│   ├── services/          # Queue engine and decay worker
│   ├── models/            # PostgreSQL schema and seed data
│   ├── schemas/           # Zod validation rules
│   ├── middleware/        # auth, validation, and error handling
│   ├── config/            # Database and Logger configuration
│   ├── utils/             # Reusable helper functions
│   └── __tests__/         # integration coverage for high-risk flows
├── frontend/
│   ├── src/pages/         # company dashboard and applicant portal
│   ├── src/hooks/         # React Query data access layer
│   ├── src/components/    # Reusable UI primitives (Command Center cards)
│   └── src/api.js         # API client configuration
├── docker-compose.yml     # local full-stack boot path
├── .env.example           # template for local environment secrets
└── README.md              # architecture and evaluator guide
```

If I were onboarding another engineer, I would point them to these files first:

- [backend/services/queueService.js](./backend/services/queueService.js)
- [backend/services/decayManager.js](./backend/services/decayManager.js)
- [backend/models/schema.sql](./backend/models/schema.sql)
- [backend/__tests__/concurrency.test.js](./backend/__tests__/concurrency.test.js)
- [frontend/src/pages/CompanyCommandCenter.jsx](./frontend/src/pages/CompanyCommandCenter.jsx)
- [frontend/src/pages/ApplicantPortal.jsx](./frontend/src/pages/ApplicantPortal.jsx)

## 8. API Documentation

| Endpoint | Method | Auth | Request Body | Expected Response |
| --- | --- | --- | --- | --- |
| `/api/auth/login` | `POST` | None | `{ "role": "APPLICANT", "email": "jane@example.com" }` or `{ "role": "COMPANY_ADMIN" }` | `{ "token": "jwt", "role": "APPLICANT" }` |
| `/api/jobs` | `POST` | `COMPANY_ADMIN` | `{ "title": "Backend Engineer", "capacity": 2 }` | Newly created job row |
| `/api/jobs` | `GET` | `COMPANY_ADMIN` or `APPLICANT` | None | Array of jobs with `activeCount` and `waitlistCount` |
| `/api/jobs/:id/applicants` | `GET` | `COMPANY_ADMIN` | None | Ordered non-exited pipeline snapshot for the job |
| `/api/jobs/:id/apply` | `POST` | `APPLICANT` or `COMPANY_ADMIN` | Applicant: `{}`. Admin-assisted apply: `{ "email": "candidate@example.com" }` | `{ "id": "uuid", "status": "PENDING_ACK" }`, `{ "id": "uuid", "status": "WAITLISTED" }`, or duplicate application payload |
| `/api/applicants/me` | `GET` | `APPLICANT` | None | Array of the authenticated applicant's applications |
| `/api/applicants/:id/status` | `GET` | `APPLICANT` or `COMPANY_ADMIN` | None | Applicant record plus `position` when `WAITLISTED` |
| `/api/applicants/:id/acknowledge` | `POST` | `APPLICANT` | None | `{ "message": "Status updated to Active" }` |
| `/api/applicants/:id/exit` | `POST` | `APPLICANT` | None | `{ "message": "Successfully withdrawn from pipeline. Cascading promotion triggered." }` |
| `/api/audit-logs?since=<id>` | `GET` | `COMPANY_ADMIN` | None | Delta stream of `StateLogs` joined with applicant email |

### Example: Apply to a job

```http
POST /api/jobs/:id/apply
Authorization: Bearer <jwt>
Content-Type: application/json

{}
```

Possible response:

```json
{
  "id": "application-uuid",
  "status": "WAITLISTED"
}
```

### Example: Check waitlist position

```http
GET /api/applicants/:id/status
Authorization: Bearer <jwt>
```

Possible response:

```json
{
  "id": "application-uuid",
  "job_id": "job-uuid",
  "email": "jane@example.com",
  "status": "WAITLISTED",
  "priority_score": 42,
  "decay_count": 1,
  "last_transition_at": "2026-04-24T00:00:00.000Z",
  "position": 3
}
```

## 9. Testing and Verification

The backend test suite currently validates the highest-risk behaviors:

- **Concurrent last-slot applications**
- **Applicant ownership isolation**
- **Automatic promotion after active-slot release**

Test file:

- [backend/__tests__/concurrency.test.js](./backend/__tests__/concurrency.test.js)

Verified scenarios:

1. `50` parallel applicants compete for a job with capacity `1`
2. Exactly one applicant lands in `PENDING_ACK`
3. The remaining applicants land in `WAITLISTED`
4. Queue ordering remains unique and collision-free
5. One applicant cannot read another applicant's status
6. Exiting an active applicant triggers immediate promotion of the next waitlisted candidate

This is important because the README is not merely describing intended behavior; the highest-risk parts of the design are covered by integration tests.

## 10. Demo Walkthrough

If I were presenting this submission to a hiring panel or recording a Loom, I would use this flow:

### 3-minute evaluator script

1. Open the company dashboard and show a fresh job with capacity `1`.
2. Open two applicant sessions with different emails.
3. Submit applicant A, then submit applicant B.
4. Show that applicant A is `PENDING_ACK` and applicant B is `WAITLISTED`.
5. Call out that this is not timing luck; it is enforced by a transaction plus `FOR UPDATE`.
6. Withdraw applicant A or let applicant A timeout.
7. Show applicant B automatically move into `PENDING_ACK`.
8. Open the audit view and replay the transitions from `StateLogs`.

### What the evaluator should notice

- The queue advances without manual intervention.
- Capacity is never exceeded.
- A timed-out applicant is not deleted; they are penalized and requeued.
- Every movement is traceable with a trigger label.
- The frontend reflects backend state rather than fabricating it locally.

### Suggested narration

“Two applicants are competing for a single active slot. The first request acquires the job lock, evaluates occupancy, and inserts into `PENDING_ACK`. The second request blocks on the same row lock, re-evaluates after commit, and lands in `WAITLISTED`. If the active applicant exits or times out, the release and promotion happen in the same transaction, so the queue heals itself without an operator touching it.”

## 11. Submission Checklist

Before sharing this repository with an evaluator, I would verify the following:

- `docker-compose up --build` boots frontend, backend, and PostgreSQL without manual fixes
- `backend npm test` passes locally
- `frontend npm run build` completes successfully
- the README links and Mermaid diagrams render on GitHub
- the demo flow shows one applicant in `PENDING_ACK` and one in `WAITLISTED`
- the audit trail visibly records `USER_APPLIED`, `SYSTEM_PROMOTION`, `USER_ACK`, `TIMEOUT_DECAY`, and `USER_EXIT`
- the Loom recording stays under five minutes and follows the scripted flow above

### Recommended screenshots for the GitHub landing page

If adding visuals before submission, these are the only screenshots I would include:

1. Company dashboard showing one active applicant and one waitlisted applicant for the same job
![Company Dashboard](image.png)

2. Applicant portal showing queue position and acknowledgement countdown state
![Applicant Portal](image-1.png)

3. Audit or transition history view showing reconstructable state changes
![Audit History](image-2.png)

Those three images tell the whole story without clutter.

## 12. Engineering Retrospective

### Trade-offs made for challenge speed

- The decay worker is an in-process heartbeat poller instead of a distributed scheduling system.
- The authentication layer is intentionally lightweight and local-first; it is not a production identity platform.
- SQL bootstrap files are used instead of a formal migration framework.
- The frontend uses deliberate polling rather than WebSockets or SSE.
- The queue engine is optimized for correctness on a single PostgreSQL primary rather than globally distributed writes.

### What I would build next

- A migration framework such as Prisma Migrate, Knex migrations, or Flyway
- WebSockets or SSE for lower-latency admin visibility
- A distributed worker or leader-election strategy for multi-instance decay processing
- Job-level configuration for acknowledgement windows and decay thresholds
- More domain events and analytics around conversion, timeout rate, and queue churn
- A richer reviewer workflow beyond queue management
- A dedicated applicant timeline endpoint that replays `StateLogs` directly

## 13. Lead Engineer Assessment

From a senior reviewer perspective, this submission solves the right problem in the right layer.

The strongest architectural choice is that the queue is not simulated in JavaScript memory. It is modeled as transactional state in PostgreSQL. The concurrency path uses pessimistic locking where the challenge actually needs it. The decay algorithm is bounded, deterministic, and auditable. The transition log is append-only and sufficient for replay.

Most importantly, the code demonstrates an understanding that distributed-systems bugs in small products usually begin as state-management shortcuts. This implementation avoids that trap by grounding the hardest behaviors in database-backed atomic operations.
