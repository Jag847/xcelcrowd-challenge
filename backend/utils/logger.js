const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty', // Pretty-print for development view
    options: {
      colorize: true
    }
  }
});

module.exports = logger;
