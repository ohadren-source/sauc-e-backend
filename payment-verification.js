/**
 * payment-verification.js
 * Verify subscriptions across Stripe, PayPal, Square
 * Used when users return from checkout with subscription IDs
 */

const axios = require('axios');

// ============================================================================
// STRIPE VERIFICATION
// ============================================================================

async function verifyStripeSubscription(customerId) {
  /**
   * Query Stripe API for active subscriptions.
   * Returns true if any active subscription exists.
   */
  const stripeApiKey = process.env.STRIPE_API_KEY;
  if (!stripeApiKey) {
    console.warn('STRIPE_API_KEY not set');
    return false;
  }

  try {
    const response = await axios.get(
      `https://api.stripe.com/v1/customers/${customerId}/subscriptions`,
      {
        auth: { username: stripeApiKey, password: '' },
        params: { status: 'active', limit: 1 }
      }
    );

    const isActive = response.data.data.length > 0;
    console.log(`[Stripe] Customer ${customerId}: ${isActive ? 'ACTIVE' : 'INACTIVE'}`);
    return isActive;
  } catch (err) {
    console.error(`[Stripe] Verification failed for ${customerId}:`, err.message);
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

async function verifySubscription(paymentProvider, subscriptionId) {
  /**
   * Unified interface for all payment providers.
   * Returns true if subscription is active, false otherwise.
   */
  if (!paymentProvider || !subscriptionId) {
    return false;
  }

  const provider = paymentProvider.toLowerCase();

  if (provider === 'stripe') {
    return await verifyStripeSubscription(subscriptionId);
  } else if (provider === 'paypal') {
    return await verifyPayPalSubscription(subscriptionId);
  } else if (provider === 'square') {
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
  verifyStripeSubscription,
  verifyPayPalSubscription,
  verifySquareSubscription,
  verifySubscription
};
