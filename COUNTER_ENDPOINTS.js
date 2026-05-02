/**
 * COUNTER_ENDPOINTS.js
 * Add these endpoints to sauc-e-backend.js
 *
 * Copy the counter-db and payment-verification require statements at the top,
 * then add these routes.
 */

// ============================================================================
// AT TOP OF sauc-e-backend.js, AFTER REQUIRES:
// ============================================================================

// const counterDb = require('./counter-db');
// const paymentVerification = require('./payment-verification');

// Call this on startup:
// counterDb.ensureCounterTables();

// ============================================================================
// ADD THESE ROUTES TO sauc-e-backend.js
// ============================================================================

/**
 * POST /api/bbqe/usage-status
 * Get or create user counter. Check if subscription is valid.
 */
app.post('/api/bbqe/usage-status', async (req, res) => {
  try {
    const { fingerprint, payment_provider, subscription_id } = req.body;

    if (!fingerprint) {
      return res.status(400).json({ status: 'error', message: 'fingerprint required' });
    }

    // Get or create user
    let user = await counterDb.getOrCreateCounterUser(fingerprint, 'bbqe');
    if (!user) {
      return res.status(500).json({ status: 'error', message: 'Could not create user' });
    }

    // If subscription data provided, verify it
    if (payment_provider && subscription_id) {
      const isActive = await paymentVerification.verifySubscription(
        payment_provider,
        subscription_id
      );
      if (isActive && !user.is_paid) {
        user = await counterDb.markUserPaid(user.id, payment_provider, subscription_id);
      }
    }

    res.json({
      status: 'ok',
      userId: user.id,
      usageCount: user.is_paid ? 0 : (9 - user.uses_remaining),
      usesRemaining: user.is_paid ? 999999 : user.uses_remaining,
      isPaid: user.is_paid
    });
  } catch (err) {
    console.error('[BBQE] usage-status error:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

/**
 * POST /api/catsup/usage-status
 */
app.post('/api/catsup/usage-status', async (req, res) => {
  try {
    const { fingerprint, payment_provider, subscription_id } = req.body;

    if (!fingerprint) {
      return res.status(400).json({ status: 'error', message: 'fingerprint required' });
    }

    let user = await counterDb.getOrCreateCounterUser(fingerprint, 'catsup');
    if (!user) {
      return res.status(500).json({ status: 'error', message: 'Could not create user' });
    }

    if (payment_provider && subscription_id) {
      const isActive = await paymentVerification.verifySubscription(
        payment_provider,
        subscription_id
      );
      if (isActive && !user.is_paid) {
        user = await counterDb.markUserPaid(user.id, payment_provider, subscription_id);
      }
    }

    res.json({
      status: 'ok',
      userId: user.id,
      usageCount: user.is_paid ? 0 : (9 - user.uses_remaining),
      usesRemaining: user.is_paid ? 999999 : user.uses_remaining,
      isPaid: user.is_paid
    });
  } catch (err) {
    console.error('[CATSUP] usage-status error:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

/**
 * POST /api/relish/usage-status
 */
app.post('/api/relish/usage-status', async (req, res) => {
  try {
    const { fingerprint, payment_provider, subscription_id } = req.body;

    if (!fingerprint) {
      return res.status(400).json({ status: 'error', message: 'fingerprint required' });
    }

    let user = await counterDb.getOrCreateCounterUser(fingerprint, 'relish');
    if (!user) {
      return res.status(500).json({ status: 'error', message: 'Could not create user' });
    }

    if (payment_provider && subscription_id) {
      const isActive = await paymentVerification.verifySubscription(
        payment_provider,
        subscription_id
      );
      if (isActive && !user.is_paid) {
        user = await counterDb.markUserPaid(user.id, payment_provider, subscription_id);
      }
    }

    res.json({
      status: 'ok',
      userId: user.id,
      usageCount: user.is_paid ? 0 : (9 - user.uses_remaining),
      usesRemaining: user.is_paid ? 999999 : user.uses_remaining,
      isPaid: user.is_paid
    });
  } catch (err) {
    console.error('[RELISH] usage-status error:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

/**
 * POST /api/{app}/decrement
 * Called after successful action (scan, question, wisdom)
 */
app.post('/api/bbqe/decrement', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ status: 'error', message: 'userId required' });
    }

    const updated = await counterDb.decrementCounter(userId, 'bbqe');
    if (!updated) {
      return res.status(500).json({ status: 'error', message: 'Could not decrement' });
    }

    if (updated.uses_remaining <= 0 && !updated.is_paid) {
      return res.status(403).json({
        status: 'paywall',
        usesRemaining: 0,
        message: 'Free uses exhausted'
      });
    }

    res.json({
      status: 'ok',
      usesRemaining: updated.uses_remaining
    });
  } catch (err) {
    console.error('[BBQE] decrement error:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Similar endpoints for catsup/decrement and relish/decrement...

// ============================================================================
// ENVIRONMENT VARIABLES NEEDED IN .env:
// ============================================================================

/*
DATABASE_URL=postgresql://postgres:KjBwNlgAADQQnNhsIhpvUBRHxDGZoMIq@postgres.railway.internal:5432/railway

STRIPE_API_KEY=sk_live_...
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
SQUARE_ACCESS_TOKEN=sq_live_...
*/
