const db = require('../config/db');

const createHttpError = (message, statusCode) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

class QueueService {
    async logStateChange(client, applicantId, from, to, trigger) {
        await client.query(
            'INSERT INTO StateLogs (applicant_id, from_status, to_status, trigger) VALUES ($1, $2, $3, $4)',
            [applicantId, from, to, trigger]
        );
    }

    async transitionApplicant(client, applicantId, fromStatus, toStatus, trigger, extraAssignments = [], extraValues = []) {
        const setClauses = [
            'status = $1',
            'last_transition_at = NOW()',
            'updated_at = NOW()',
            ...extraAssignments.map((assignment, index) => `${assignment} = $${index + 3}`)
        ];

        await client.query(
            `UPDATE Applicants SET ${setClauses.join(', ')} WHERE id = $2`,
            [toStatus, applicantId, ...extraValues]
        );

        await this.logStateChange(client, applicantId, fromStatus, toStatus, trigger);
    }

    async getLockedApplicant(client, applicantId) {
        const result = await client.query(
            'SELECT id, job_id, email, status FROM Applicants WHERE id = $1 FOR UPDATE',
            [applicantId]
        );

        if (result.rows.length === 0) {
            throw createHttpError('Applicant not found', 404);
        }

        return result.rows[0];
    }

    assertApplicantAccess(applicant, actor) {
        if (!actor || !actor.role) {
            throw createHttpError('Unauthorized', 401);
        }

        if (actor.role === 'COMPANY_ADMIN') {
            return;
        }

        if (!actor.email || applicant.email !== actor.email) {
            throw createHttpError('Forbidden: You can only access your own application', 403);
        }
    }

    /**
     * Entry point for the concurrency-safe application flow.
     * Uses pessimistic row-locking on the target Job record to serialize 
     * capacity evaluation across high-frequency concurrent requests.
     */
    async applyToJob(email, jobId) {
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            const existingApp = await client.query(
                'SELECT id, status FROM Applicants WHERE job_id = $1 AND email = $2 AND status != \'EXITED\'',
                [jobId, email]
            );
            if (existingApp.rows.length > 0) {
                await client.query('COMMIT');
                return { id: existingApp.rows[0].id, status: existingApp.rows[0].status, alreadyApplied: true };
            }

            // Lock the Job row at the database IO level to prevent 'Last Spot' race conditions.
            const jobRes = await client.query('SELECT capacity FROM Jobs WHERE id = $1 FOR UPDATE', [jobId]);
            if (jobRes.rows.length === 0) throw new Error('Job not found');
            const capacity = jobRes.rows[0].capacity;

            const countRes = await client.query(
                'SELECT COUNT(*) FROM Applicants WHERE job_id = $1 AND status IN (\'ACTIVE\', \'PENDING_ACK\')',
                [jobId]
            );
            const currentCount = parseInt(countRes.rows[0].count, 10);

            let status = 'WAITLISTED';
            if (currentCount < capacity) {
                status = 'PENDING_ACK';
            }

            let appRes;
            try {
                appRes = await client.query(
                    'INSERT INTO Applicants (job_id, email, status) VALUES ($1, $2, $3) RETURNING id',
                    [jobId, email, status]
                );
            } catch (insertError) {
                if (insertError.code === '23505') { // Unique constraint violation
                    await client.query('ROLLBACK');
                    return { error: 'Conflict: Active application already exists for this candidate', status: 409 };
                }
                throw insertError;
            }

            await this.logStateChange(client, appRes.rows[0].id, null, status, 'USER_APPLIED');

            await client.query('COMMIT');
            return { id: appRes.rows[0].id, status };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    // Pass the client from the exitApplicant/decayManager so it guarantees the transaction is closed atomically
    /**
     * Deterministic queue promotion logic. 
     * If providedClient is passed, the operation executes within the caller's transaction context,
     * ensuring that slot release and queue advancement happen as a single atomic unit.
     */
    async promoteNext(jobId, providedClient = null) {
        let client = providedClient || await db.connect();
        try {
            if (!providedClient) await client.query('BEGIN');
            // We lock the job to ensure concurrent promotions don't race
            const jobResult = await client.query(
                'SELECT capacity FROM Jobs WHERE id = $1 FOR UPDATE',
                [jobId]
            );

            if (jobResult.rows.length === 0) {
                throw createHttpError('Job not found', 404);
            }

            const activeCountResult = await client.query(
                'SELECT COUNT(*) FROM Applicants WHERE job_id = $1 AND status IN (\'ACTIVE\', \'PENDING_ACK\')',
                [jobId]
            );

            if (parseInt(activeCountResult.rows[0].count, 10) >= parseInt(jobResult.rows[0].capacity, 10)) {
                if (!providedClient) await client.query('COMMIT');
                return null;
            }

            // Promote based on deterministic sequence ordering.
            // SKIP LOCKED allows horizontally scaled workers to fetch discrete chunks of candidates.
            const waitlistedApplicant = await client.query(
                'SELECT id FROM Applicants WHERE job_id = $1 AND status = \'WAITLISTED\' ORDER BY priority_score ASC LIMIT 1 FOR UPDATE SKIP LOCKED',
                [jobId]
            );

            if (waitlistedApplicant.rows.length > 0) {
                const applicantId = waitlistedApplicant.rows[0].id;
                await this.transitionApplicant(
                    client,
                    applicantId,
                    'WAITLISTED',
                    'PENDING_ACK',
                    'SYSTEM_PROMOTION'
                );
            }

            if (!providedClient) await client.query('COMMIT');
        } catch (e) {
            if (!providedClient) await client.query('ROLLBACK');
            throw e;
        } finally {
            if (!providedClient) client.release();
        }
    }

    async acknowledge(applicantId, actor) {
        const client = await db.connect();
        try {
            await client.query('BEGIN');
            const applicant = await this.getLockedApplicant(client, applicantId);
            this.assertApplicantAccess(applicant, actor);

            if (applicant.status !== 'PENDING_ACK') {
                throw createHttpError('Not in acknowledgment window', 409);
            }

            await this.transitionApplicant(client, applicantId, 'PENDING_ACK', 'ACTIVE', 'USER_ACK');
            
            await client.query('COMMIT');
            return { success: true };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    async exitApplicant(applicantId, actor) {
        const client = await db.connect();
        try {
            await client.query('BEGIN');
            const applicant = await this.getLockedApplicant(client, applicantId);
            this.assertApplicantAccess(applicant, actor);
            const jobId = applicant.job_id;
            const oldStatus = applicant.status;

            if (oldStatus === 'EXITED') {
                await client.query('COMMIT');
                return { success: true, alreadyExited: true };
            }

            await this.transitionApplicant(client, applicantId, oldStatus, 'EXITED', 'USER_EXIT');

            // ONLY promote the next person if the person leaving was occupying a slot.
            if (['ACTIVE', 'PENDING_ACK'].includes(oldStatus)) {
                await this.promoteNext(jobId, client);
            }
            
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }
}

module.exports = new QueueService();
