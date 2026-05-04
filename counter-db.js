/**
 * counter-db.js
 * Counter persistence layer for sauc-e-backend
 * Handles browser fingerprints + subscription verification
 *
 * Tables:
 *   - sauce_counter_users: fingerprint + app_name = unique user identity
 *   - sauce_counter_actions: audit log of decrement/paid events
 */

const { Pool } = require('pg');

// ============================================================================
// SUBSCRIPTION TIER MAPPING
// ============================================================================
// Maps subscription IDs from all providers to their tier level

const SUBSCRIPTION_TIER_MAP = {
  // PayPal Plan IDs
  'P-45948399FA681270DNHAH43Y': 'bbqe-premium',
  'P-17886177FN0218458NHAH2JA': 'bbqe-pitboss',
  'P-58676712YW9357247NG6XZXI': 'relish',
  'P-7ES60485XB000951VNG77OZY': 'catsup',
  'P-97U37228YV854831UNG77RBA': 'catsup',

  // Stripe Product IDs (Test)
  'prod_USR6yr2VlSxxuV': 'bbqe-premium',
  'prod_USRApCvjUIYe8J': 'bbqe-pitboss',

  // Stripe Product IDs (Production - add live IDs here)
  // Format: stripe product ID → tier

  // Square Plan IDs (added as they're discovered)
  // Format: square subscription ID → tier
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// ============================================================================
// TIER LOOKUP
// ============================================================================

function getSubscriptionTier(subscriptionId) {
  /**
   * Look up subscription ID in the tier mapping.
   * Returns: 'bbqe-premium', 'bbqe-pitboss', 'catsup', 'relish', or null
   */
  return SUBSCRIPTION_TIER_MAP[subscriptionId] || null;
}

// ============================================================================
// INITIALIZE TABLES
// ============================================================================

async function ensureCounterTables() {
  try {
    const client = await pool.connect();

    // Counter users table
    // NOTE: fingerprint is NOT globally unique — it's unique per (fingerprint, app_name)
    // because the same device fingerprint legitimately appears across all 3 apps
    // (catsup, relish, bbqe). Each app gets its own counter row per device.
    await client.query(`
      CREATE TABLE IF NOT EXISTS sauce_counter_users (
        id                      SERIAL PRIMARY KEY,
        fingerprint             TEXT NOT NULL,
        app_name                TEXT NOT NULL CHECK (app_name IN ('bbqe', 'catsup', 'relish')),
        demo_started_at         TIMESTAMPTZ DEFAULT now(),
        uses_remaining          INT NOT NULL DEFAULT 9,
        is_paid                 BOOLEAN DEFAULT FALSE,
        payment_provider        TEXT CHECK (payment_provider IN ('stripe', 'paypal', 'square', 'revenuecat')),
        subscription_customer_id TEXT,
        subscription_tier       TEXT,
        paid_at                 TIMESTAMPTZ,
        created_at              TIMESTAMPTZ DEFAULT now(),
        updated_at              TIMESTAMPTZ DEFAULT now(),
        UNIQUE (fingerprint, app_name)
      );
    `);

    // ====================================================================
    // MIGRATION: drop legacy global-UNIQUE on fingerprint, add composite
    // UNIQUE on (fingerprint, app_name). Runs idempotently on every start.
    // Only effective for tables created before the schema was fixed above.
    // ====================================================================

    // Drop the legacy unique constraint on fingerprint alone, if present.
    // Postgres auto-names inline UNIQUE constraints as
    // <table>_<column>_key, so the legacy name is sauce_counter_users_fingerprint_key.
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'sauce_counter_users_fingerprint_key'
            AND conrelid = 'sauce_counter_users'::regclass
        ) THEN
          ALTER TABLE sauce_counter_users
            DROP CONSTRAINT sauce_counter_users_fingerprint_key;
          RAISE NOTICE 'Dropped legacy UNIQUE constraint on fingerprint';
        END IF;
      END $$;
    `);

    // Add the composite unique constraint if missing.
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'sauce_counter_users_fingerprint_app_unique'
            AND conrelid = 'sauce_counter_users'::regclass
        ) THEN
          ALTER TABLE sauce_counter_users
            ADD CONSTRAINT sauce_counter_users_fingerprint_app_unique
            UNIQUE (fingerprint, app_name);
          RAISE NOTICE 'Added composite UNIQUE on (fingerprint, app_name)';
        END IF;
      END $$;
    `);

    // Add subscription_tier column if missing (for existing tables)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'sauce_counter_users'
            AND column_name = 'subscription_tier'
        ) THEN
          ALTER TABLE sauce_counter_users
            ADD COLUMN subscription_tier TEXT;
          RAISE NOTICE 'Added subscription_tier column';
        END IF;
      END $$;
    `);

    // Counter actions audit log
    await client.query(`
      CREATE TABLE IF NOT EXISTS sauce_counter_actions (
        id              SERIAL PRIMARY KEY,
        user_id         INT NOT NULL,
        app_name        TEXT NOT NULL,
        action_type     TEXT CHECK (action_type IN ('decrement', 'paid', 'grace_applied')),
        uses_before     INT,
        uses_after      INT,
        created_at      TIMESTAMPTZ DEFAULT now()
      );
    `);

    client.release();
    console.log('✓ Counter tables initialized');
  } catch (err) {
    console.error('Failed to initialize counter tables:', err);
  }
}

// ============================================================================
// COUNTER OPERATIONS
// ============================================================================

async function getOrCreateCounterUser(fingerprint, appName) {
  try {
    const client = await pool.connect();

    // Check if exists
    let result = await client.query(
      'SELECT * FROM sauce_counter_users WHERE fingerprint = $1 AND app_name = $2',
      [fingerprint, appName]
    );

    if (result.rows.length > 0) {
      client.release();
      return result.rows[0];
    }

    // Create new user with 9 free uses
    result = await client.query(
      `INSERT INTO sauce_counter_users (fingerprint, app_name, uses_remaining)
       VALUES ($1, $2, 9)
       RETURNING *`,
      [fingerprint, appName]
    );

    client.release();
    return result.rows[0];
  } catch (err) {
    console.error('getOrCreateCounterUser error:', err);
    return null;
  }
}

async function decrementCounter(userId, appName) {
  try {
    const client = await pool.connect();

    // Get current state
    let before = await client.query(
      'SELECT uses_remaining FROM sauce_counter_users WHERE id = $1',
      [userId]
    );
    const usesBefore = before.rows[0]?.uses_remaining || 0;

    // Decrement
    let result = await client.query(
      `UPDATE sauce_counter_users
       SET uses_remaining = uses_remaining - 1, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [userId]
    );

    const usesAfter = result.rows[0]?.uses_remaining || -1;

    // Log action
    await client.query(
      `INSERT INTO sauce_counter_actions (user_id, app_name, action_type, uses_before, uses_after)
       VALUES ($1, $2, 'decrement', $3, $4)`,
      [userId, appName, usesBefore, usesAfter]
    );

    client.release();
    return result.rows[0];
  } catch (err) {
    console.error('decrementCounter error:', err);
    return null;
  }
}

async function markUserPaid(userId, paymentProvider, subscriptionId) {
  try {
    const client = await pool.connect();

    // Determine tier from subscription ID
    const tier = getSubscriptionTier(subscriptionId) || 'unknown';

    const result = await client.query(
      `UPDATE sauce_counter_users
       SET is_paid = TRUE, paid_at = now(), uses_remaining = 999999,
           payment_provider = $1, subscription_customer_id = $2,
           subscription_tier = $3, updated_at = now()
       WHERE id = $4
       RETURNING *`,
      [paymentProvider, subscriptionId, tier, userId]
    );

    client.release();
    return result.rows[0];
  } catch (err) {
    console.error('markUserPaid error:', err);
    return null;
  }
}

async function getCounterUser(fingerprint, appName) {
  try {
    const client = await pool.connect();

    const result = await client.query(
      'SELECT * FROM sauce_counter_users WHERE fingerprint = $1 AND app_name = $2',
      [fingerprint, appName]
    );

    client.release();
    return result.rows[0] || null;
  } catch (err) {
    console.error('getCounterUser error:', err);
    return null;
  }
}

async function updateSubscriptionStatus(userId, isActive) {
  try {
    const client = await pool.connect();

    const result = await client.query(
      `UPDATE sauce_counter_users
       SET is_paid = $1, updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [isActive, userId]
    );

    client.release();
    return result.rows[0];
  } catch (err) {
    console.error('updateSubscriptionStatus error:', err);
    return null;
  }
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports = {
  pool,
  ensureCounterTables,
  getOrCreateCounterUser,
  decrementCounter,
  markUserPaid,
  getCounterUser,
  updateSubscriptionStatus,
  getSubscriptionTier,
  SUBSCRIPTION_TIER_MAP
};
