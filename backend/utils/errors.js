class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(message, 404);
    }
}

class ConflictError extends AppError {
    constructor(message = 'Conflict detected') {
        super(message, 409);
    }
}

class ForbiddenError extends AppError {
    constructor(message = 'Forbidden') {
        super(message, 403);
    }
}

class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized') {
        super(message, 401);
    }
}

class ValidationError extends AppError {
    constructor(message = 'Validation failed') {
        super(message, 400);
    }
}

module.exports = {
    AppError,
    NotFoundError,
    ConflictError,
    ForbiddenError,
    UnauthorizedError,
    ValidationError
};
