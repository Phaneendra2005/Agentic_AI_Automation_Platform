const { NODE_ENV } = require('../config/env');

module.exports = function errorHandler(err, req, res, next) {
  const status = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  if (NODE_ENV !== 'production') {
    console.error('[Error]', err);
  }

  res.status(status).json({
    success: false,
    message,
    ...(NODE_ENV !== 'production' && { stack: err.stack }),
  });
};
