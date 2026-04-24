const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const authenticate = (allowedRoles = []) => (req, res, next) => {
    // 1. Token presence check
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized: No JWT provided' });
    }

    try {
        // 2. Token authenticity verification using secure Env variable
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;

        // 3. RBAC (Role Based Access Control) restriction bounds
        if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.role)) {
            logger.warn({ userRole: decoded.role, allowedRoles }, 'Role violation blocked');
            return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
        }
        
        next();
    } catch (err) {
        logger.warn({ err: err.message }, 'JWT verification failed');
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }
};

module.exports = authenticate;
