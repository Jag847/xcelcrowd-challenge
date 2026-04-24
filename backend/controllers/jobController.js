const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const db = require('../config/db');
const validate = require('../middleware/validate');
const { createJobSchema, applyJobSchema, getPipelineSchema } = require('../schemas');
const queueService = require('../services/queueService');
const authenticate = require('../middleware/auth');

// Strict rate limiter to absolutely block Applicant Portal DDoS bots
const applyLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: process.env.NODE_ENV === 'test' ? 1000 : 30,
    message: { error: 'Strict limit exceeded: Too many capacity applications requested.' }
});

// POST /api/jobs (Create a job)
router.post('/', authenticate(['COMPANY_ADMIN']), validate(createJobSchema), async (req, res, next) => {
    try {
        const { title, capacity } = req.body;
        const result = await db.query(
            'INSERT INTO Jobs (title, capacity) VALUES ($1, $2) RETURNING *',
            [title, capacity]
        );
        res.status(201).json(result.rows[0]);
    } catch (e) {
        next(e);
    }
});

// GET /api/jobs (Get all jobs)
router.get('/', authenticate(['COMPANY_ADMIN', 'APPLICANT']), async (req, res, next) => {
    try {
        const jobs = await db.query(`
            SELECT 
                j.id, 
                j.title, 
                j.capacity,
                (SELECT COUNT(*) FROM Applicants WHERE job_id = j.id AND status IN ('ACTIVE', 'PENDING_ACK')) as "activeCount",
                (SELECT COUNT(*) FROM Applicants WHERE job_id = j.id AND status = 'WAITLISTED') as "waitlistCount"
            FROM Jobs j
        `);
        const formattedJobs = jobs.rows.map(job => ({
            ...job,
            activeCount: parseInt(job.activeCount),
            waitlistCount: parseInt(job.waitlistCount)
        }));
        res.json(formattedJobs);
    } catch (e) {
        next(e);
    }
});

// GET /api/jobs/:id/applicants (Get the current pipeline for a job)
router.get('/:id/applicants', authenticate(['COMPANY_ADMIN']), validate(getPipelineSchema), async (req, res, next) => {
    try {
        const { id } = req.params;
        const pipelineResult = await db.query(`
            SELECT id, email, status, priority_score, last_transition_at 
            FROM Applicants 
            WHERE job_id = $1 AND status != 'EXITED'
            ORDER BY 
                CASE 
                    WHEN status = 'ACTIVE' THEN 1
                    WHEN status = 'PENDING_ACK' THEN 2
                    WHEN status = 'WAITLISTED' THEN 3
                END ASC, priority_score ASC
        `, [id]);
        res.json(pipelineResult.rows);
    } catch (e) {
        next(e);
    }
});

// POST /api/jobs/:id/apply (The concurrency-safe application flow)
router.post('/:id/apply', applyLimiter, authenticate(['APPLICANT', 'COMPANY_ADMIN']), validate(applyJobSchema), async (req, res, next) => {
    try {
        const { id } = req.params;
        const email = (req.user.role === 'COMPANY_ADMIN' && req.body.email) 
            ? req.body.email 
            : req.user.email;
            
        if (!email) return res.status(400).json({ error: "Email required" });
        
        const result = await queueService.applyToJob(email, id);
        
        if (result.error && result.status === 409) {
            return res.status(409).json({ error: result.error });
        }
        
        res.status(201).json(result);
    } catch (e) {
        next(e);
    }
});

module.exports = router;
