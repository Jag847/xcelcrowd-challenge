CREATE TYPE applicant_status AS ENUM ('WAITLISTED', 'PENDING_ACK', 'ACTIVE', 'EXITED');

CREATE TABLE Jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    capacity INT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

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

CREATE TABLE StateLogs (
    id BIGSERIAL PRIMARY KEY,
    applicant_id UUID REFERENCES Applicants(id),
    from_status applicant_status,
    to_status applicant_status,
    trigger VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- The "Engine" Index: Critical for O(log N) promotion
CREATE INDEX idx_job_status_priority ON Applicants(job_id, status, priority_score ASC) INCLUDE (id);
-- The "Decay" Index: Critical for the Heartbeat Poller
CREATE INDEX idx_decay_check ON Applicants(status, last_transition_at);
-- Prevent duplicate active applications
CREATE UNIQUE INDEX idx_unique_active_application ON Applicants(job_id, email) WHERE status != 'EXITED';
