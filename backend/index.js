require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const pinoHttp = require('pino-http');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

const applicantRouter = require('./controllers/applicantController');
const jobRouter = require('./controllers/jobController');
const decayManager = require('./services/decayManager');
const db = require('./config/db');
const authenticate = require('./middleware/auth');

const app = express();
const allowedRoles = new Set(['APPLICANT', 'COMPANY_ADMIN']);

// Security Middlewares & Observability Integration
app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger }));

// Global Rate Limiter
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 mins
    max: process.env.NODE_ENV === 'test' ? 1000 : 1000,
    message: { error: 'Global capacity mechanism engaged. Too many network requests.' }
});
app.use(globalLimiter);

// System Health/Heartbeat
app.get('/health', async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.status(200).json({ status: 'OK', message: 'Database responding' });
    } catch (err) {
        logger.error({ err }, 'Healthcheck database disconnection');
        res.status(500).json({ status: 'ERROR', message: 'Database disconnected' });
    }
});

// Mock Production Login Endpoint (generates environment-validated JWT issuance)
app.post('/api/auth/login', (req, res) => {
    const { role, email } = req.body; 
    if (!process.env.JWT_SECRET) {
        return res.status(500).json({ error: 'CRITICAL: JWT_SECRET environment missing configured isolation boundary.' });
    }

    const resolvedRole = role || 'APPLICANT';
    if (!allowedRoles.has(resolvedRole)) {
        return res.status(400).json({ error: 'Unsupported role requested' });
    }

    if (resolvedRole === 'APPLICANT' && !email) {
        return res.status(400).json({ error: 'Email is required for applicant login' });
    }
    
    // Sign securely against environment configuration
    const token = jwt.sign(
        { sub: 'auth_verified_user', role: resolvedRole, email: email || 'anonymous@demo.com' }, 
        process.env.JWT_SECRET, 
        { expiresIn: '24h' }
    );
    res.json({ token, role: resolvedRole });
});

app.use('/api/applicants', applicantRouter);
app.use('/api/jobs', jobRouter);

// Audit Logs Endpoint for Delta Polling
app.get('/api/audit-logs', authenticate(['COMPANY_ADMIN']), async (req, res, next) => {
    try {
        const sinceId = req.query.since || 0;
        const logs = await db.query(`
            SELECT s.*, a.email
            FROM StateLogs s
            JOIN Applicants a ON s.applicant_id = a.id
            WHERE s.id > $1
            ORDER BY s.id DESC
            LIMIT 100
        `, [sinceId]);
        res.json(logs.rows);
    } catch (e) {
        next(e);
    }
});

// Centralized error responder
app.use(errorHandler);

// Execution Bounds: Allow integration testing (Jest) to import without blocking ports
if (require.main === module) {
    decayManager.start();
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => logger.info(`Engine Server spun up on port ${PORT}`));
}

module.exports = app;
