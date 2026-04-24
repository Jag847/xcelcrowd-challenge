const db = require('../config/db');
const queueService = require('./queueService');
const logger = require('../utils/logger'); // Pino Logger

const DECAY_WINDOW_HOURS = Number(process.env.ACK_WINDOW_HOURS || 24);
const MAX_DECAYS = Number(process.env.MAX_DECAYS || 3);

class DecayManager {
    constructor() {
        this.interval = 60000;
        this.isRunning = false;
        this.timeoutId = null;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        logger.info('Decay Manager Heartbeat Started (Recursive Poller)...');
        this.timeoutId = setTimeout(() => this.processDecays(), 0);
    }

    stop() {
        this.isRunning = false;
        if (this.timeoutId) clearTimeout(this.timeoutId);
    }

    async processDecays() {
        if (!this.isRunning) return;
        
        const BATCH_SIZE = 100;
        
        while (this.isRunning) {
            const client = await db.connect();
            try {
                await client.query('BEGIN');

                // 1. Identify expired applicants. 
                // We use FOR UPDATE SKIP LOCKED to permit parallel worker instances to process 
                // discrete batches without cross-instance locking contention.
                const expired = await client.query(
                     `SELECT id, job_id, decay_count FROM Applicants 
                      WHERE status = 'PENDING_ACK' 
                     AND last_transition_at < NOW() - ($2::int * INTERVAL '1 hour')
                     FOR UPDATE SKIP LOCKED LIMIT $1`,
                    [BATCH_SIZE, DECAY_WINDOW_HOURS]
                );

                if (expired.rows.length === 0) {
                    await client.query('COMMIT');
                    break;
                }

                for (const row of expired.rows) {
                    const { id, job_id, decay_count } = row;

                    if (decay_count >= MAX_DECAYS) {
                        // Purge zombies
                        await queueService.transitionApplicant(
                            client,
                            id,
                            'PENDING_ACK',
                            'EXITED',
                            'MAX_DECAY_PURGE'
                        );
                        logger.info({ applicantId: id, jobId: job_id }, 'Applicant reached max decays. Purged to EXITED.');
                    } else {
                        // Penalize by assigning a new sequence value, effectively pushing the applicant
                        // to the physical end of the waitlist (deterministic repositioning).
                        await client.query(
                            'UPDATE Applicants SET status = \'WAITLISTED\', priority_score = nextval(\'priority_score_seq\'), decay_count = $2, last_transition_at = NOW(), updated_at = NOW() WHERE id = $1',
                            [id, decay_count + 1]
                        );
                        await queueService.logStateChange(
                            client,
                            id,
                            'PENDING_ACK',
                            'WAITLISTED',
                            'TIMEOUT_DECAY'
                        );
                    }
                    
                    // Cascade passing the shared transaction client
                    await queueService.promoteNext(job_id, client);
                }

                await client.query('COMMIT');
            } catch (err) {
                await client.query('ROLLBACK');
                logger.error({ err }, 'Decay Process Batch Error');
                break;
            } finally {
                client.release();
            }
        }

        // Strategic recursive timeout mechanism. 
        // This mitigates DB contention and prevents stack overflow/execution overlap 
        // if a transaction batch takes longer than the intended interval.
        if (this.isRunning) {
            this.timeoutId = setTimeout(() => this.processDecays(), this.interval);
        }
    }
}

module.exports = new DecayManager();
