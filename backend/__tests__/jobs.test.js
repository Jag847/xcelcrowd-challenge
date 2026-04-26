process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_jobs';

const request = require('supertest');
const app = require('../index');
const db = require('../config/db');

describe('Job Management', () => {
    let tokenAdmin;

    beforeAll(async () => {
        const response = await request(app).post('/api/auth/login').send({ role: 'COMPANY_ADMIN' });
        tokenAdmin = response.body.token;
    });

    beforeEach(async () => {
        await db.query('DELETE FROM StateLogs');
        await db.query('DELETE FROM Applicants');
        await db.query('DELETE FROM Jobs');
    });

    afterAll(async () => {
        await db.end();
    });

    it('creates a job with valid data', async () => {
        const res = await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ title: 'Cloud Architect', capacity: 3 });
        
        expect(res.status).toBe(201);
        expect(res.body.title).toBe('Cloud Architect');
        expect(res.body.capacity).toBe(3);
    });

    it('requires title and capacity for job creation', async () => {
        const res = await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ title: 'Bad Job' });
        
        expect(res.status).toBe(400);
    });

    it('allows applicants to list jobs', async () => {
        const applicantToken = (await request(app).post('/api/auth/login').send({ role: 'APPLICANT', email: 'test@test.com' })).body.token;

        await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${tokenAdmin}`)
            .send({ title: 'Public Job', capacity: 1 });
        
        const res = await request(app)
            .get('/api/jobs')
            .set('Authorization', `Bearer ${applicantToken}`);

        expect(res.status).toBe(200);
        expect(res.body.length).toBeGreaterThanOrEqual(1);
        expect(res.body[0].title).toBe('Public Job');
        expect(res.body[0]).toHaveProperty('activeCount');
        expect(res.body[0]).toHaveProperty('waitlistCount');
    });

    it('blocks job creation from non-admin roles', async () => {
        const applicantToken = (await request(app).post('/api/auth/login').send({ role: 'APPLICANT', email: 'test@test.com' })).body.token;
        
        const res = await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${applicantToken}`)
            .send({ title: 'Hacker Job', capacity: 100 });
        
        expect(res.status).toBe(403);
    });
});
