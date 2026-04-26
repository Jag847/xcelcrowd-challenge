process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_crucible_enclave';

const request = require('supertest');
const app = require('../index');
const db = require('../config/db');

describe('Next In Line backend guarantees', () => {
    let tokenAdmin;
    let jobId;

    const mintToken = async (role, email) => {
        const payload = role === 'APPLICANT' ? { role, email } : { role };
        const response = await request(app).post('/api/auth/login').send(payload);
        return response.body.token;
    };

    const createJob = async (title = 'Lead Staff Engineer', capacity = 1) => {
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

    it('safely sequences 50 parallel applications for a single remaining slot', async () => {
        const applicantTokens = await Promise.all(
            Array.from({ length: 50 }, (_, idx) => mintToken('APPLICANT', `competitor${idx}@crucible.test`))
        );

        const payloadSpray = applicantTokens.map((token) =>
            request(app)
                .post(`/api/jobs/${jobId}/apply`)
                .set('Authorization', `Bearer ${token}`)
                .send({})
        );

        const responses = await Promise.allSettled(payloadSpray);

        for (const response of responses) {
            expect(response.status).toBe('fulfilled');
            expect(response.value.status).toBe(201);
        }

        const dbVerification = await db.query(
            'SELECT status, priority_score FROM Applicants WHERE job_id = $1 ORDER BY priority_score ASC',
            [jobId]
        );

        const applicants = dbVerification.rows;
        expect(applicants.length).toBe(50);
        expect(applicants[0].status).toBe('PENDING_ACK');

        const remaining = applicants.slice(1);
        const states = new Set(remaining.map((applicant) => applicant.status));
        expect(states.size).toBe(1);
        expect([...states][0]).toBe('WAITLISTED');

        const priorities = applicants.map((applicant) => Number(applicant.priority_score));
        expect(new Set(priorities).size).toBe(50);
    }, 30000);

    it('prevents one applicant from reading another applicant status', async () => {
        const ownerToken = await mintToken('APPLICANT', 'owner@pipeline.test');
        const intruderToken = await mintToken('APPLICANT', 'intruder@pipeline.test');

        const applyResponse = await request(app)
            .post(`/api/jobs/${jobId}/apply`)
            .set('Authorization', `Bearer ${ownerToken}`)
            .send({});

        const statusResponse = await request(app)
            .get(`/api/applicants/${applyResponse.body.id}/status`)
            .set('Authorization', `Bearer ${intruderToken}`);

        expect(statusResponse.status).toBe(403);
        expect(statusResponse.body.error).toMatch(/own application/i);
    });

    it('promotes the next waitlisted applicant when an active applicant exits', async () => {
        const firstApplicantToken = await mintToken('APPLICANT', 'first@pipeline.test');
        const secondApplicantToken = await mintToken('APPLICANT', 'second@pipeline.test');

        const firstApply = await request(app)
            .post(`/api/jobs/${jobId}/apply`)
            .set('Authorization', `Bearer ${firstApplicantToken}`)
            .send({});

        const secondApply = await request(app)
            .post(`/api/jobs/${jobId}/apply`)
            .set('Authorization', `Bearer ${secondApplicantToken}`)
            .send({});

        expect(firstApply.body.status).toBe('PENDING_ACK');
        expect(secondApply.body.status).toBe('WAITLISTED');

        const exitResponse = await request(app)
            .post(`/api/applicants/${firstApply.body.id}/exit`)
            .set('Authorization', `Bearer ${firstApplicantToken}`);

        expect(exitResponse.status).toBe(200);

        const secondStatus = await request(app)
            .get(`/api/applicants/${secondApply.body.id}/status`)
            .set('Authorization', `Bearer ${secondApplicantToken}`);

        expect(secondStatus.status).toBe(200);
        expect(secondStatus.body.status).toBe('PENDING_ACK');

        const logs = await db.query(
            'SELECT trigger, from_status, to_status FROM StateLogs ORDER BY id ASC'
        );

        expect(logs.rows).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ trigger: 'USER_EXIT', from_status: 'PENDING_ACK', to_status: 'EXITED' }),
                expect.objectContaining({ trigger: 'SYSTEM_PROMOTION', from_status: 'WAITLISTED', to_status: 'PENDING_ACK' })
            ])
        );
    }, 30000);
});
