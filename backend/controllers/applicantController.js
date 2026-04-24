const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const db = require('../config/db');
const validate = require('../middleware/validate');
const { statusSchema, acknowledgeSchema } = require('../schemas');
const queueService = require('../services/queueService');
const authenticate = require('../middleware/auth');

const ensureApplicantCanAccess = (applicant, user) => {
    if (user.role === 'COMPANY_ADMIN') {
        return;
    }

    if (!user.email || applicant.email !== user.email) {
        const error = new Error('Forbidden: You can only access your own application');
        error.statusCode = 403;
        throw error;
    }
};

// Strict read limiter to completely ban external scraping routines testing position arrays
const statusLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 1000 : 120,
    message: { error: 'Strict limit exceeded: Pinged status checks too frequently.' }
});

// GET /api/applicants/me
router.get('/me', authenticate(['APPLICANT']), async (req, res, next) => {
    try {
        const email = req.user.email;
        if (!email || email === 'anonymous@demo.com') {
            return res.status(400).json({ error: 'Valid email required in token' });
        }
        
        const apps = await db.query(`
            SELECT a.*, j.title as job_title 
            FROM Applicants a 
            JOIN Jobs j ON a.job_id = j.id 
            WHERE a.email = $1 
            ORDER BY a.last_transition_at DESC
        `, [email]);
        
        res.json(apps.rows);
    } catch (e) {
        next(e);
    }
});

// GET /api/applicants/:id/status
router.get('/:id/status', statusLimiter, authenticate(['APPLICANT', 'COMPANY_ADMIN']), validate(statusSchema), async (req, res, next) => {
    try {
        const { id } = req.params;
        const appRes = await db.query(`
            SELECT a.*, j.title as job_title 
            FROM Applicants a 
            JOIN Jobs j ON a.job_id = j.id 
            WHERE a.id = $1
        `, [id]);
        if (appRes.rows.length === 0) return res.status(404).json({ error: 'Not found' });

        const applicant = appRes.rows[0];
        ensureApplicantCanAccess(applicant, req.user);
        let position = null;

        if (applicant.status === 'WAITLISTED') {
            const posRes = await db.query(
                'SELECT COUNT(*) FROM Applicants WHERE job_id = $1 AND status = \'WAITLISTED\' AND priority_score < $2',
                [applicant.job_id, applicant.priority_score]
            );
            position = parseInt(posRes.rows[0].count) + 1;
        }

        res.json({ ...applicant, position });
    } catch (e) {
        next(e);
    }
});

// POST /api/applicants/:id/acknowledge
router.post('/:id/acknowledge', authenticate(['APPLICANT']), validate(acknowledgeSchema), async (req, res, next) => {
    try {
        const { id } = req.params;
        await queueService.acknowledge(id, req.user);
        res.json({ message: 'Status updated to Active' });
    } catch (e) {
        next(e);
    }
});

// POST /api/applicants/:id/exit (Trigger the Cascade)
router.post('/:id/exit', authenticate(['APPLICANT']), async (req, res, next) => {
    try {
        const { id } = req.params;
        await queueService.exitApplicant(id, req.user);
        res.json({ message: 'Successfully withdrawn from pipeline. Cascading promotion triggered.' });
    } catch (e) {
        next(e);
    }
});

module.exports = router;
