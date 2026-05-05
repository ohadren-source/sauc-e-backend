/**
 * payment-verification.js
 * Verify subscriptions across Stripe, PayPal, Square
 * Used when users return from checkout with subscription IDs
 */

const axios = require('axios');

// ============================================================================
// STRIPE VERIFICATION
// ============================================================================

/**
 * Given a Stripe checkout session ID, retrieve the subscription ID
 * (if a subscription was created during checkout)
 */
async function getStripeSubscriptionIdFromSession(sessionId) {
  const stripeApiKey = process.env.STRIPE_API_KEY;

  if (!stripeApiKey) {
    console.warn('STRIPE_API_KEY not set');
    return null;
  }

  try {
    const response = await axios.get(
      `https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
      {
        auth: { username: stripeApiKey, password: '' }
      }
    );

    const session = response.data;
    // If payment mode is 'subscription', subscription ID is in session.subscription
    if (session.payment_status === 'paid' && session.subscription) {
      console.log(`[Stripe] Session ${sessionId} → Subscription ${session.subscription}`);
      return session.subscription;
    }

    console.log(`[Stripe] Session ${sessionId}: no subscription found`);
    return null;
  } catch (err) {
    console.error(`[Stripe] Failed to retrieve subscription from session ${sessionId}:`, err.message);
    return null;
  }
}

async function verifyStripeSubscription(subscriptionId) {
  /**
   * Query Stripe API for active subscription.
   * Returns true if subscription is ACTIVE.
   */
  const stripeApiKey = process.env.STRIPE_API_KEY;

  if (!stripeApiKey) {
    console.warn('STRIPE_API_KEY not set');
    return false;
  }

  try {
    const response = await axios.get(
      `https://api.stripe.com/v1/subscriptions/${subscriptionId}`,
      {
        auth: { username: stripeApiKey, password: '' }
      }
    );

    const status = response.data.status;
    const isActive = status === 'active';
    console.log(`[Stripe] Subscription ${subscriptionId}: ${status} (${isActive ? 'ACTIVE' : 'INACTIVE'})`);
    return isActive;
  } catch (err) {
    console.error(`[Stripe] Verification failed for ${subscriptionId}:`, err.message);
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

async function verifySubscription(paymentProvider, subscriptionOrSessionId) {
  /**
   * Unified interface for all payment providers.
   *
   * For Stripe: subscriptionOrSessionId can be either:
   *   - A subscription ID (sub_xxxxx) - verify directly
   *   - A checkout session ID (cs_xxxxx) - lookup subscription first, then verify
   *
   * For PayPal/Square: subscriptionOrSessionId is the subscription ID
   *
   * Returns true if subscription is active, false otherwise.
   */
  if (!paymentProvider || !subscriptionOrSessionId) {
    return false;
  }

  const provider = paymentProvider.toLowerCase();

  if (provider === 'stripe') {
    // Handle both session IDs (cs_xxxxx) and subscription IDs (sub_xxxxx)
    let subscriptionId = subscriptionOrSessionId;

    if (subscriptionId.startsWith('cs_')) {
      // This is a checkout session ID - retrieve the subscription ID
      console.log(`[Stripe] Attempting to extract subscription from session ${subscriptionId}`);
      subscriptionId = await getStripeSubscriptionIdFromSession(subscriptionId);
      if (!subscriptionId) {
        console.warn(`[Stripe] Could not extract subscription ID from session`);
        return false;
      }
    }

    return await verifyStripeSubscription(subscriptionId);
  } else if (provider === 'paypal') {
    return await verifyPayPalSubscription(subscriptionOrSessionId);
  } else if (provider === 'square') {
    return await verifySquareSubscription(subscriptionOrSessionId);
  } else {
    console.warn(`Unknown payment provider: ${provider}`);
    return false;
  }
}

// ============================================================================
// EXPORT
// ============================================================================

module.exports = {
  getStripeSubscriptionIdFromSession,
  verifyStripeSubscription,
  verifyPayPalSubscription,
  verifySquareSubscription,
  verifySubscription
};
