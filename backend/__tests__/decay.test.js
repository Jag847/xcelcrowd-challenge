process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_decay';
process.env.ACK_WINDOW_HOURS = '1';

const request = require('supertest');
const app = require('../index');
const db = require('../config/db');
const decayManager = require('../services/decayManager');

describe('Decay System Implementation', () => {
    let tokenAdmin;
    let jobId;

    const mintToken = async (role, email) => {
        const payload = role === 'APPLICANT' ? { role, email } : { role };
        const response = await request(app).post('/api/auth/login').send(payload);
        return response.body.token;
    };

    const createJob = async (title = 'Stability Software Engineer', capacity = 1) => {
        const response = await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ title, capacity });

        return response.body.id;
    };

    beforeAll(async () => {
        tokenAdmin = await mintToken('COMPANY_ADMIN');
    });

    beforeEach(async () => {
        await db.query('DELETE FROM StateLogs');
        await db.query('DELETE FROM Applicants');
        await db.query('DELETE FROM Jobs');
        jobId = await createJob();
    });

    afterAll(async () => {
        await db.end();
    });

    it('processes decay when window expires and promotes next in same transaction', async () => {
        const applicant1Token = await mintToken('APPLICANT', 'app1@decay.test');
        const applicant2Token = await mintToken('APPLICANT', 'app2@decay.test');

        const app1Res = await request(app)
            .post(`/api/jobs/${jobId}/apply`)
            .set('Authorization', `Bearer ${applicant1Token}`)
            .send({});
        
        await request(app)
            .post(`/api/jobs/${jobId}/apply`)
            .set('Authorization', `Bearer ${applicant2Token}`)
            .send({});

        // Manually age the first applicant
        await db.query(
            "UPDATE Applicants SET last_transition_at = NOW() - INTERVAL '2 hours' WHERE id = $1",
            [app1Res.body.id]
        );

        // Run decay manager logic once
        decayManager.isRunning = true;
        await decayManager.processDecays();
        decayManager.isRunning = false;

        const app1Status = await request(app)
            .get(`/api/applicants/${app1Res.body.id}/status`)
            .set('Authorization', `Bearer ${applicant1Token}`);
        
        expect(app1Status.body.status).toBe('WAITLISTED');
        expect(app1Status.body.decay_count).toBe(1);

        const app2Status = await request(app)
            .get(`/api/applicants/me`)
            .set('Authorization', `Bearer ${applicant2Token}`);
        
        expect(app2Status.body[0].status).toBe('PENDING_ACK');
    });

    it('purges applicant to EXITED after max decays', async () => {
        const applicantToken = await mintToken('APPLICANT', 'zombie@decay.test');
        const res = await request(app)
            .post(`/api/jobs/${jobId}/apply`)
            .set('Authorization', `Bearer ${applicantToken}`)
            .send({});
        
        const appId = res.body.id;

        // Set to max decays minus one
        await db.query(
            "UPDATE Applicants SET decay_count = 3, last_transition_at = NOW() - INTERVAL '2 hours' WHERE id = $1",
            [appId]
        );

        decayManager.isRunning = true;
        await decayManager.processDecays();
        decayManager.isRunning = false;

        const status = await request(app)
            .get(`/api/applicants/${appId}/status`)
            .set('Authorization', `Bearer ${applicantToken}`);
        
        expect(status.body.status).toBe('EXITED');
    });
});
