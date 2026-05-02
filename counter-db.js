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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// ============================================================================
// INITIALIZE TABLES
// ============================================================================

async function ensureCounterTables() {
  try {
    const client = await pool.connect();

    // Counter users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sauce_counter_users (
        id                      SERIAL PRIMARY KEY,
        fingerprint             TEXT NOT NULL UNIQUE,
        app_name                TEXT NOT NULL CHECK (app_name IN ('bbqe', 'catsup', 'relish')),
        demo_started_at         TIMESTAMPTZ DEFAULT now(),
        uses_remaining          INT NOT NULL DEFAULT 9,
        is_paid                 BOOLEAN DEFAULT FALSE,
        payment_provider        TEXT CHECK (payment_provider IN ('stripe', 'paypal', 'square', 'revenuecat')),
        subscription_customer_id TEXT,
        paid_at                 TIMESTAMPTZ,
        created_at              TIMESTAMPTZ DEFAULT now(),
        updated_at              TIMESTAMPTZ DEFAULT now()
      );
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

    const result = await client.query(
      `UPDATE sauce_counter_users
       SET is_paid = TRUE, paid_at = now(), uses_remaining = 999999,
           payment_provider = $1, subscription_customer_id = $2, updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [paymentProvider, subscriptionId, userId]
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
  updateSubscriptionStatus
};
