const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
    logger.error({ 
        err: err.message, 
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined 
    }, 'Unhandled Exception');
    
    // Catch PostgreSQL Deadlock (40P01 is deadlock detected in PG)
    // Serialization failure is 40001
    if (err.code === '40P01' || err.code === '40001') {
        return res.status(409).json({ error: "Transaction conflict detected. Please retry." });
    }

    if (err.statusCode) {
        return res.status(err.statusCode).json({ error: err.message });
    }

    if (err.message === 'Job not found') {
        return res.status(404).json({ error: err.message });
    }

    res.status(500).json({ error: "Internal Server Error", details: err.message });
};

module.exports = errorHandler;
