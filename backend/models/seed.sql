-- Database Seeding for "Next In Line" Evaluators
-- This script pre-populates the database so reviewers can immediately see the Waitlist & Decay logic in action.

-- 1. Create a Job: Senior Staff Engineer (Capacity: 2)
INSERT INTO Jobs (id, title, capacity) VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Senior Staff Engineer', 2);

-- 2. Fill the Active Capacity
-- Candidate 1 is fully ACTIVE.
INSERT INTO Applicants (job_id, email, status) VALUES 
  ('11111111-1111-1111-1111-111111111111', 'alice.active@demo.com', 'ACTIVE');

-- Candidate 2 is PENDING_ACK
-- IMPORTANT: We intentionally backdate their transition by 25 hours. 
-- When you run \`docker-compose up\`, the DecayManager will instantly detect this, 
-- penalize it, and trigger a promotion cascade in real-time.
INSERT INTO Applicants (job_id, email, status, last_transition_at) VALUES 
  ('11111111-1111-1111-1111-111111111111', 'bob.decaying@demo.com', 'PENDING_ACK', NOW() - INTERVAL '25 hours');

-- 3. Populate a Waitlist Pipeline
-- These candidates will be sequentially queued. Charlie will automatically transition 
-- to PENDING_ACK exactly 60 seconds after startup due to Bob's decay.
INSERT INTO Applicants (job_id, email, status) VALUES 
  ('11111111-1111-1111-1111-111111111111', 'charlie.waitlist1@demo.com', 'WAITLISTED'),
  ('11111111-1111-1111-1111-111111111111', 'diana.waitlist2@demo.com', 'WAITLISTED'),
  ('11111111-1111-1111-1111-111111111111', 'edwin.waitlist3@demo.com', 'WAITLISTED'),
  ('11111111-1111-1111-1111-111111111111', 'fiona.waitlist4@demo.com', 'WAITLISTED');

-- 4. Create an Empty Job for immediate "Apply" Testing
INSERT INTO Jobs (id, title, capacity) VALUES 
  ('22222222-2222-2222-2222-222222222222', 'Director of Engineering', 1);
