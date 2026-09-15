/**
 * Vercel serverless entry point.
 *
 * Vercel turns every module in /api into a serverless function. This one
 * exports the Express app (see ../server.js). All routes live under /api/*,
 * so the rewrite in vercel.json forwards everything here.
 *
 * The app is lazily initialised (no app.listen on Vercel — the platform owns
 * the HTTP layer). MongoDB connects on first use; see server.js ensureDB.
 */
import app from '../server.js';

export default app;
