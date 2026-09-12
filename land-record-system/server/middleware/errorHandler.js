/** Not found */
export function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

/** Central error handler */
export function errorHandler(err, req, res, _next) {
  console.error('[error]', err.message);
  if (err.name === 'ValidationError') {
    const msg = Object.values(err.errors).map((e) => e.message).join('; ');
    return res.status(400).json({ message: msg });
  }
  if (err.code === 11000) {
    return res.status(409).json({ message: 'Duplicate key error.', field: Object.keys(err.keyPattern || {}) });
  }
  if (err.message && /Only PDF|File too large/.test(err.message)) {
    return res.status(400).json({ message: err.message });
  }
  const status = err.status || 500;
  res.status(status).json({ message: err.message || 'Internal server error' });
}
