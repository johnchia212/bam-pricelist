// Global middleware: currently a no-op passthrough.
// Auth is enforced per-endpoint (see functions/api/*.js) since the
// static shell (index.html/app.js) contains no price data on its own —
// only the /api/pricelist and /api/upload endpoints require a session.
export async function onRequest({ next }) {
  return next();
}
