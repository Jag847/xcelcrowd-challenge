# Next In Line - API Documentation

This document provides a detailed overview of the API endpoints for the "Next In Line" hiring system.

## Authentication

All endpoints except `POST /api/auth/login` require a JSON Web Token (JWT) provided in the `Authorization` header as a Bearer token.

```
Authorization: Bearer <your_jwt_token>
```

### POST /api/auth/login
Simulates a login. Returns a JWT.

**Request Body:**
```json
{
  "role": "APPLICANT",
  "email": "candidate@example.com"
}
```
*or*
```json
{
  "role": "COMPANY_ADMIN"
}
```

**Response (200 OK):**
```json
{
  "token": "jwt_token_string",
  "role": "APPLICANT"
}
```

---

## Jobs

### GET /api/jobs
Returns all job postings with their current capacity and waitlist stats.

**Auth:** `APPLICANT` or `COMPANY_ADMIN`

**Response (200 OK):**
```json
[
  {
    "id": "uuid",
    "title": "Backend Engineer",
    "capacity": 5,
    "activeCount": 2,
    "waitlistCount": 10
  }
]
```

### POST /api/jobs
Creates a new job opening.

**Auth:** `COMPANY_ADMIN`

**Request Body:**
```json
{
  "title": "Senior Frontend Developer",
  "capacity": 3
}
```

**Response (201 Created):**
```json
{
  "id": "uuid",
  "title": "Senior Frontend Developer",
  "capacity": 3,
  "activeCount": 0,
  "waitlistCount": 0
}
```

### GET /api/jobs/:id/applicants
Returns the list of applicants for a specific job, ordered by priority.

**Auth:** `COMPANY_ADMIN`

**Response (200 OK):**
```json
[
  {
    "id": "uuid",
    "email": "user@example.com",
    "status": "ACTIVE",
    "priority_score": 1,
    "last_transition_at": "2026-04-26T12:00:00Z"
  }
]
```

### POST /api/jobs/:id/apply
Applies to a job. If capacity is full, the applicant is waitlisted.

**Auth:** `APPLICANT` or `COMPANY_ADMIN` (Admin can apply on behalf of an email)

**Request Body (Optional for APPLICANT):**
```json
{
  "email": "optional_candidate@example.com"
}
```

**Response (201 Created):**
```json
{
  "id": "uuid",
  "status": "PENDING_ACK"
}
```
*or*
```json
{
  "id": "uuid",
  "status": "WAITLISTED"
}
```

---

## Applicants

### GET /api/applicants/me
Returns all applications for the authenticated applicant.

**Auth:** `APPLICANT`

**Response (200 OK):**
```json
[
  {
    "id": "uuid",
    "job_id": "uuid",
    "job_title": "Backend Engineer",
    "status": "ACTIVE",
    "last_transition_at": "2026-04-26T12:00:00Z"
  }
]
```

### GET /api/applicants/:id/status
Returns detailed status and queue position for an application.

**Auth:** `APPLICANT` (own) or `COMPANY_ADMIN`

**Response (200 OK):**
```json
{
  "id": "uuid",
  "job_id": "uuid",
  "job_title": "Backend Engineer",
  "email": "user@example.com",
  "status": "WAITLISTED",
  "position": 5,
  "priority_score": 100,
  "decay_count": 0,
  "last_transition_at": "2026-04-26T12:00:00Z"
}
```

### POST /api/applicants/:id/acknowledge
Acknowledges a slot opening (promotes from `PENDING_ACK` to `ACTIVE`).

**Auth:** `APPLICANT`

**Response (200 OK):**
```json
{
  "message": "Status updated to Active"
}
```

### POST /api/applicants/:id/exit
Withdraws an application. Triggers a cascading promotion if a slot is released.

**Auth:** `APPLICANT`

**Response (200 OK):**
```json
{
  "message": "Successfully withdrawn from pipeline. Cascading promotion triggered."
}
```

---

## System

### GET /health
Checks if the API and database are responding correctly.

**Auth:** None

**Response (200 OK):**
```json
{
  "status": "OK",
  "message": "Database responding"
}
```

### GET /api/audit-logs
Returns a stream of state transition logs.

**Auth:** `COMPANY_ADMIN`

**Query Parameters:**
- `since`: (Optional) Log ID to fetch logs created after this ID.

**Response (200 OK):**
```json
[
  {
    "id": 105,
    "applicant_id": "uuid",
    "email": "user@example.com",
    "from_status": "WAITLISTED",
    "to_status": "PENDING_ACK",
    "trigger": "SYSTEM_PROMOTION",
    "created_at": "2026-04-26T12:05:00Z"
  }
]
```
