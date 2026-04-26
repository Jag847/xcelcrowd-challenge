const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
    logger.error({ 
        err: err.message, 
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined 
    }, 'Error Stack');
    
    // Catch PostgreSQL Deadlock (40P01 is deadlock detected in PG)
    // Serialization failure is 40001
    if (err.code === '40P01' || err.code === '40001') {
        return res.status(409).json({ error: "Transaction conflict detected. Please retry." });
    }

    if (err.statusCode) {
        return res.status(err.statusCode).json({ error: err.message });
    }

    // Default to 500
    const statusCode = err.statusCode || 500;
    const message = statusCode === 500 ? "Internal Server Error" : err.message;
    
    res.status(statusCode).json({ 
        error: message, 
        details: process.env.NODE_ENV === 'development' ? err.message : undefined 
    });
};

module.exports = errorHandler;
