/**
 * payment-verification.js
 * Verify subscriptions across Stripe, PayPal, Square
 * Used when users return from checkout with subscription IDs
 */

const axios = require('axios');

// ============================================================================
// STRIPE VERIFICATION
// ============================================================================

async function resolveStripeSubscriptionFromSession(sessionId) {
  /**
   * Fetch a Stripe Checkout Session and extract the subscription ID.
   * Stripe hosted payment links create the subscription server-side and
   * return a session_id (cs_xxxxx) in the redirect URL — not a sub_xxxxx.
   * This function bridges that gap.
   *
   * Returns the subscription ID (sub_xxxxx) or null on failure.
   */
  const stripeApiKey = process.env.STRIPE_API_KEY;
  if (!stripeApiKey) {
    console.warn('[Stripe] STRIPE_API_KEY not set — cannot resolve session');
    return null;
  }

  try {
    const response = await axios.get(
      `https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
      {
        auth: { username: stripeApiKey, password: '' }
      }
    );

    const subscriptionId = response.data.subscription;
    if (!subscriptionId) {
      console.warn(`[Stripe] Session ${sessionId} has no subscription attached`);
      return null;
    }

    console.log(`[Stripe] Resolved session ${sessionId} → subscription ${subscriptionId}`);
    return subscriptionId;
  } catch (err) {
    console.error(`[Stripe] Failed to resolve session ${sessionId}:`, err.message);
    return null;
  }
}

async function verifyStripeSubscription(subscriptionOrCustomerId) {
  /**
   * Verify an active Stripe subscription.
   *
   * Accepts three input formats:
   *   - cs_xxxxx  — Stripe Checkout Session ID (from hosted payment links)
   *                 Resolved to a subscription ID first via the Sessions API.
   *   - sub_xxxxx — Stripe Subscription ID
   *                 Verified directly via the Subscriptions API.
   *   - cus_xxxxx — Stripe Customer ID (legacy)
   *                 Lists active subscriptions for that customer.
   *
   * Returns true if an active subscription is found, false otherwise.
   */
  const stripeApiKey = process.env.STRIPE_API_KEY;
  if (!stripeApiKey) {
    console.warn('STRIPE_API_KEY not set');
    return false;
  }

  try {
    // --- Path 1: Checkout Session ID → resolve to subscription first ---
    if (subscriptionOrCustomerId.startsWith('cs_')) {
      const subscriptionId = await resolveStripeSubscriptionFromSession(subscriptionOrCustomerId);
      if (!subscriptionId) {
        console.warn(`[Stripe] Could not resolve session ${subscriptionOrCustomerId} to a subscription`);
        return false;
      }
      // Recurse with the resolved subscription ID
      return await verifyStripeSubscription(subscriptionId);
    }

    // --- Path 2: Subscription ID — verify directly ---
    if (subscriptionOrCustomerId.startsWith('sub_')) {
      const response = await axios.get(
        `https://api.stripe.com/v1/subscriptions/${subscriptionOrCustomerId}`,
        {
          auth: { username: stripeApiKey, password: '' }
        }
      );

      const status = response.data.status;
      const isActive = status === 'active' || status === 'trialing';
      console.log(`[Stripe] Subscription ${subscriptionOrCustomerId}: ${status} (${isActive ? 'ACTIVE' : 'INACTIVE'})`);
      return isActive;
    }

    // --- Path 3: Customer ID — list active subscriptions (legacy) ---
    const response = await axios.get(
      `https://api.stripe.com/v1/customers/${subscriptionOrCustomerId}/subscriptions`,
      {
        auth: { username: stripeApiKey, password: '' },
        params: { status: 'active', limit: 1 }
      }
    );

    const isActive = response.data.data.length > 0;
    console.log(`[Stripe] Customer ${subscriptionOrCustomerId}: ${isActive ? 'ACTIVE' : 'INACTIVE'}`);
    return isActive;
  } catch (err) {
    console.error(`[Stripe] Verification failed for ${subscriptionOrCustomerId}:`, err.message);
    return false;
  }
}

// ============================================================================
// PAYPAL VERIFICATION
// ============================================================================

async function verifyPayPalSubscription(subscriptionId) {
  /**
   * Query PayPal API for subscription status.
   * Returns true if subscription is ACTIVE.
   */
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn('PayPal credentials not set');
    return false;
  }

  try {
    // Get access token
    const tokenResponse = await axios.post(
      'https://api.paypal.com/v1/oauth2/token',
      'grant_type=client_credentials',
      {
        auth: { username: clientId, password: clientSecret },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    const accessToken = tokenResponse.data.access_token;

    // Get subscription details
    const subResponse = await axios.get(
      `https://api.paypal.com/v1/billing/subscriptions/${subscriptionId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    const status = subResponse.data.status?.toUpperCase();
    const isActive = status === 'ACTIVE';
    console.log(`[PayPal] Subscription ${subscriptionId}: ${status} (${isActive ? 'ACTIVE' : 'INACTIVE'})`);
    return isActive;
  } catch (err) {
    console.error(`[PayPal] Verification failed for ${subscriptionId}:`, err.message);
    return false;
  }
}

// ============================================================================
// SQUARE VERIFICATION
// ============================================================================

async function verifySquareSubscription(subscriptionId) {
  /**
   * Query Square API for subscription status.
   * Returns true if subscription is ACTIVE.
   */
  const squareAccessToken = process.env.SQUARE_ACCESS_TOKEN;

  if (!squareAccessToken) {
    console.warn('SQUARE_ACCESS_TOKEN not set');
    return false;
  }

  try {
    const response = await axios.get(
      `https://connect.squareup.com/v2/subscriptions/${subscriptionId}`,
      {
        headers: { Authorization: `Bearer ${squareAccessToken}` }
      }
    );

    const status = response.data.subscription?.status;
    const isActive = status === 'ACTIVE';
    console.log(`[Square] Subscription ${subscriptionId}: ${status} (${isActive ? 'ACTIVE' : 'INACTIVE'})`);
    return isActive;
  } catch (err) {
    console.error(`[Square] Verification failed for ${subscriptionId}:`, err.message);
    return false;
  }
}

// ============================================================================
// UNIFIED VERIFICATION
// ============================================================================

async function verifySubscription(paymentProvider, subscriptionId, sessionId) {
  /**
   * Unified interface for all payment providers.
   * Returns true if subscription is active, false otherwise.
   *
   * For Stripe hosted payment links, the frontend receives a session_id
   * (cs_xxxxx) rather than a subscription_id. Pass it as sessionId and
   * this function will resolve it to a subscription before verifying.
   *
   * Precedence for Stripe:
   *   1. subscriptionId (if provided and non-empty)
   *   2. sessionId      (if subscriptionId is absent — resolves via Sessions API)
   */
  const provider = paymentProvider ? paymentProvider.toLowerCase() : '';

  if (!provider) {
    return false;
  }

  if (provider === 'stripe') {
    // Prefer an explicit subscription_id; fall back to session_id
    const stripeId = subscriptionId || sessionId;
    if (!stripeId) {
      console.warn('[Stripe] No subscription_id or session_id provided');
      return false;
    }
    return await verifyStripeSubscription(stripeId);
  } else if (provider === 'paypal') {
    if (!subscriptionId) return false;
    return await verifyPayPalSubscription(subscriptionId);
  } else if (provider === 'square') {
    if (!subscriptionId) return false;
    return await verifySquareSubscription(subscriptionId);
  } else {
    console.warn(`Unknown payment provider: ${provider}`);
    return false;
  }
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports = {
  resolveStripeSubscriptionFromSession,
  verifyStripeSubscription,
  verifyPayPalSubscription,
  verifySquareSubscription,
  verifySubscription
};
