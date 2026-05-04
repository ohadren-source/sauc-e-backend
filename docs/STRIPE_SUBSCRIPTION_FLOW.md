# Stripe Subscription Payment Flow

**Last Updated**: May 4, 2026  
**Status**: ✅ IMPLEMENTED

---

## Overview

The Stripe payment flow handles subscription billing for recurring charges (monthly/yearly). The flow involves redirecting users to Stripe's hosted checkout, capturing the checkout session ID, extracting the subscription ID, and verifying the subscription with Stripe's API.

---

## The Problem We Solved

**Original Issue**: Stripe hosted payment links create a **checkout session** (temporary object), but we need the **subscription ID** (the actual recurring billing record) to verify payment.

- Stripe session ID format: `cs_live_xxxxxxx`
- Stripe subscription ID format: `sub_xxxxxxx`
- These are different and require an API lookup to convert one to the other.

---

## Architecture

### 1. Checkout Page (Frontend)

**File**: `sauc-e-backend/check_it_out_yall.html`

When user selects Stripe as payment method:
1. Opens Stripe hosted payment link (e.g., `https://buy.stripe.com/28E00l3HOg638gA6hxa3u00`)
2. User completes payment in Stripe's interface
3. Stripe redirects to the success URL configured in the dashboard

**Success URL Format**:
```
https://www.catsup.net/?subscribed=true&payment_provider=stripe&session_id={CHECKOUT_SESSION_ID}
```

The `{CHECKOUT_SESSION_ID}` placeholder is replaced by Stripe with the actual checkout session ID (e.g., `cs_live_abc123...`).

---

### 2. BBQE App (Frontend)

**File**: `BBQ_e-(3,6,9)/web/src/App.tsx`

When the app loads with `?subscribed=true&session_id=...`:

1. **Capture payment parameters** (lines 25-51):
   ```typescript
   const [isSubscribed, setIsSubscribed] = useState(() => {
     const params = new URLSearchParams(window.location.search)
     if (params.get('subscribed') === 'true') {
       let subscriptionId = params.get('subscription_id')
       let paymentProvider = params.get('payment_provider')

       // For Stripe: capture session_id as subscription_id
       if (!subscriptionId && params.get('session_id')) {
         subscriptionId = params.get('session_id')  // cs_live_xxx
         paymentProvider = 'stripe'
       }

       if (subscriptionId && paymentProvider) {
         sessionStorage.setItem('pending_payment_verification', JSON.stringify({
           subscription_id: subscriptionId,
           payment_provider: paymentProvider
         }))
       }

       localStorage.setItem('sauce_premium', 'true')
       window.history.replaceState({}, document.title, window.location.pathname)
     }
     return localStorage.getItem('sauce_premium') === 'true'
   })
   ```

2. **Trigger verification** (lines 66-74):
   ```typescript
   useEffect(() => {
     const pendingVerification = sessionStorage.getItem('pending_payment_verification')
     if (pendingVerification) {
       const paymentInfo = JSON.parse(pendingVerification)
       verifyPayment(paymentInfo)  // Send to backend
       sessionStorage.removeItem('pending_payment_verification')
     }
   }, [])
   ```

3. **Call backend** (lines 93-114):
   ```typescript
   async function verifyPayment(paymentInfo) {
     const response = await fetch(`/api/bbqe/usage-status`, {
       method: 'POST',
       body: JSON.stringify({
         fingerprint: fpManager.getFingerprint(),
         subscription_id: paymentInfo.subscription_id,  // cs_live_xxx or sub_xxx
         payment_provider: paymentInfo.payment_provider,
       }),
     })
     if (response.ok) {
       setScanCount(data.usageCount || 0)
       setIsSubscribed(true)  // Update UI
     }
   }
   ```

---

### 3. Backend Payment Verification

**File**: `sauc-e-backend/payment-verification.js`

The backend handles two Stripe ID formats:

#### A. Checkout Session ID → Subscription ID Lookup

**Function**: `getStripeSubscriptionIdFromSession(sessionId)`

When the frontend sends a checkout session ID (cs_live_xxx):

```javascript
async function getStripeSubscriptionIdFromSession(sessionId) {
  const response = await axios.get(
    `https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
    { auth: { username: STRIPE_API_KEY, password: '' } }
  );

  const session = response.data;
  if (session.payment_status === 'paid' && session.subscription) {
    return session.subscription;  // Returns sub_xxxxx
  }
  return null;
}
```

**What it does**:
1. Calls Stripe API with the session ID
2. Retrieves the session object
3. Extracts the `subscription` field (the actual subscription ID)
4. Returns `sub_xxxxx` to the verification function

#### B. Subscription Verification

**Function**: `verifyStripeSubscription(subscriptionId)`

Verifies the subscription is active:

```javascript
async function verifyStripeSubscription(subscriptionId) {
  const response = await axios.get(
    `https://api.stripe.com/v1/subscriptions/${subscriptionId}`,
    { auth: { username: STRIPE_API_KEY, password: '' } }
  );

  const status = response.data.status;
  return status === 'active';  // Returns true/false
}
```

**What it does**:
1. Calls Stripe API with the subscription ID
2. Retrieves the subscription object
3. Checks if `status === 'active'`
4. Returns true if active, false otherwise

#### C. Unified Interface

**Function**: `verifySubscription(paymentProvider, subscriptionOrSessionId)`

Orchestrates the flow:

```javascript
async function verifySubscription(paymentProvider, subscriptionOrSessionId) {
  if (paymentProvider.toLowerCase() === 'stripe') {
    let subscriptionId = subscriptionOrSessionId;

    // If it's a session ID (starts with cs_), convert to subscription ID
    if (subscriptionId.startsWith('cs_')) {
      subscriptionId = await getStripeSubscriptionIdFromSession(subscriptionId);
      if (!subscriptionId) return false;
    }

    // Now verify the subscription
    return await verifyStripeSubscription(subscriptionId);
  }
  // ... PayPal and Square logic
}
```

**What it does**:
1. Detects if input is a session ID or subscription ID
2. If session ID: converts to subscription ID
3. Verifies the subscription is active
4. Returns true/false

---

### 4. Backend Usage Endpoint

**File**: `sauc-e-backend/sauc-e-backend.js` (lines 756-789)

**Endpoint**: `POST /api/bbqe/usage-status`

**Request**:
```json
{
  "fingerprint": "srv_abc123...",
  "subscription_id": "cs_live_xxx or sub_xxx",
  "payment_provider": "stripe"
}
```

**Logic**:
1. Get or create user by fingerprint
2. If subscription_id provided: call `verifySubscription()`
3. If verified and not already paid: call `markUserPaid()`
4. Return usage status

**Response** (if paid):
```json
{
  "status": "ok",
  "userId": 42,
  "usageCount": 0,
  "usesRemaining": 999999,
  "isPaid": true
}
```

---

### 5. Database Persistence

**File**: `sauc-e-backend/counter-db.js` (lines 179-198)

**Function**: `markUserPaid(userId, paymentProvider, subscriptionId)`

Saves payment status to PostgreSQL:

```javascript
async function markUserPaid(userId, paymentProvider, subscriptionId) {
  await client.query(
    `UPDATE sauce_counter_users
     SET is_paid = TRUE, paid_at = now(), uses_remaining = 999999,
         payment_provider = $1, subscription_customer_id = $2, updated_at = now()
     WHERE id = $3`,
    [paymentProvider, subscriptionId, userId]
  );
}
```

**What it does**:
1. Updates user record with `is_paid = TRUE`
2. Sets `uses_remaining = 999999` (unlimited)
3. Stores payment provider and subscription ID
4. Records `paid_at` timestamp

**Result**: User is marked as premium and persists across sessions.

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. CHECKOUT PAGE (Frontend)                                     │
│    User clicks "Pay with Stripe"                                │
│    ↓                                                             │
│    Opens: https://buy.stripe.com/28E00l3HOg638gA6hxa3u00      │
│    ↓                                                             │
│    Stripe hosted checkout interface                             │
│    User enters payment details                                  │
│    ↓                                                             │
│    Payment processed (Stripe backend)                           │
│    Subscription created (sub_xxxxx)                             │
│    ↓                                                             │
│    Stripe redirects to success URL                              │
│    https://www.catsup.net/?subscribed=true&                   │
│      payment_provider=stripe&                                   │
│      session_id=cs_live_xxx                                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 2. BBQE APP (Frontend)                                          │
│    App loads with session_id in URL                             │
│    ↓                                                             │
│    Captures parameters:                                         │
│      subscription_id: "cs_live_xxx"                             │
│      payment_provider: "stripe"                                 │
│    ↓                                                             │
│    Stores in sessionStorage                                     │
│    Cleans URL (removes query params)                            │
│    ↓                                                             │
│    useEffect runs:                                              │
│      calls verifyPayment(paymentInfo)                           │
│    ↓                                                             │
│    POST /api/bbqe/usage-status {                               │
│      fingerprint: "srv_abc123",                                 │
│      subscription_id: "cs_live_xxx",  ← Session ID             │
│      payment_provider: "stripe"                                 │
│    }                                                             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 3. BACKEND PAYMENT VERIFICATION                                 │
│    Receives POST /api/bbqe/usage-status                         │
│    ↓                                                             │
│    Calls verifySubscription("stripe", "cs_live_xxx")           │
│    ↓                                                             │
│    Detects it's a session ID (starts with "cs_")               │
│    ↓                                                             │
│    Calls getStripeSubscriptionIdFromSession("cs_live_xxx")     │
│    ↓                                                             │
│    Stripe API: GET /v1/checkout/sessions/cs_live_xxx           │
│    ↓                                                             │
│    Response contains: { subscription: "sub_xxxxx", ... }       │
│    ↓                                                             │
│    Extracts subscription: "sub_xxxxx"                           │
│    ↓                                                             │
│    Calls verifyStripeSubscription("sub_xxxxx")                 │
│    ↓                                                             │
│    Stripe API: GET /v1/subscriptions/sub_xxxxx                 │
│    ↓                                                             │
│    Response contains: { status: "active", ... }                │
│    ↓                                                             │
│    Returns: true (subscription is active)                       │
│    ↓                                                             │
│    Calls markUserPaid(userId, "stripe", "sub_xxxxx")           │
│    ↓                                                             │
│    DATABASE: UPDATE sauce_counter_users                         │
│      SET is_paid = TRUE, uses_remaining = 999999, ...          │
│    ↓                                                             │
│    Response:                                                     │
│      status: "ok"                                               │
│      isPaid: true                                               │
│      usesRemaining: 999999                                      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 4. BBQE APP (Frontend) - UI Update                              │
│    Receives response: { isPaid: true, usesRemaining: 999999 }  │
│    ↓                                                             │
│    setScanCount(0)                                              │
│    setIsSubscribed(true)  ← Updates React state                │
│    ↓                                                             │
│    Component re-renders                                         │
│    Premium section disappears                                   │
│    User sees "unlimited access"                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 5. PERSISTENCE (3 weeks later)                                  │
│    User returns to BBQE app                                     │
│    ↓                                                             │
│    useEffect: syncUsageCount()                                  │
│    ↓                                                             │
│    POST /api/bbqe/usage-status {                               │
│      fingerprint: "srv_abc123"  ← Same device                   │
│    }                                                             │
│    ↓                                                             │
│    Backend looks up user by fingerprint                         │
│    Finds: is_paid = TRUE                                        │
│    ↓                                                             │
│    Response:                                                     │
│      isPaid: true                                               │
│      usesRemaining: 999999                                      │
│    ↓                                                             │
│    User still has premium access!                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Environment Variables Required

```bash
STRIPE_API_KEY=sk_live_...  # Your Stripe secret key
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
SQUARE_ACCESS_TOKEN=sq_live_...
DATABASE_URL=postgresql://...
```

---

## Stripe Dashboard Configuration

Each of the 5 payment links needs:

**Location**: Stripe Dashboard → Payment Links → [Edit Link] → After payment

**Confirmation page**: "Don't show confirmation page" → Redirect customers to your website

**Redirect URL**:
```
https://www.catsup.net/?subscribed=true&payment_provider=stripe&session_id={CHECKOUT_SESSION_ID}
```

(Replace `catsup.net` with `cats-up.app` for CATSUP or `cats-up.fun` for RELISH)

The `{CHECKOUT_SESSION_ID}` variable is replaced by Stripe automatically.

---

## Testing Checklist

- [ ] User navigates to BBQE and clicks "Upgrade"
- [ ] Redirected to checkout with `?app=bbqe`
- [ ] "BBQE Premium" plan is pre-selected
- [ ] User selects Stripe, completes payment
- [ ] Redirects back to `catsup.net/?subscribed=true&payment_provider=stripe&session_id=cs_live_xxx`
- [ ] App displays "unlimited access" (counter resets)
- [ ] Browser console has no errors
- [ ] Network tab shows successful `/api/bbqe/usage-status` call
- [ ] Database contains user with `is_paid=true`
- [ ] User comes back 3 weeks later
- [ ] User still shows premium access (persisted in database)

---

## Error Handling

If verification fails:

1. **Backend logs**:
   ```
   [Stripe] Failed to retrieve subscription from session cs_live_xxx: ...
   [Stripe] Verification failed for sub_xxxxx: ...
   ```

2. **Check**:
   - STRIPE_API_KEY is set and valid
   - Session ID is correct format (starts with `cs_`)
   - Subscription exists in Stripe dashboard
   - Subscription status is `active` (not `canceled`, `past_due`, etc.)

3. **Frontend**:
   - User is still marked as premium (localStorage)
   - Can still access app (limited by fingerprint counter)
   - Backend verification can be retried

---

## Related Files

- `sauc-e-backend/sauc-e-backend.js` - `/api/bbqe/usage-status` endpoint
- `sauc-e-backend/counter-db.js` - Database persistence
- `sauc-e-backend/payment-verification.js` - Payment provider verification (THIS FILE)
- `sauc-e-backend/check_it_out_yall.html` - Checkout page
- `BBQ_e-(3,6,9)/web/src/App.tsx` - Frontend app redirect handling

---

**Author**: Claude (Engineer)  
**Architecture**: Chef (Designer)  
**Status**: ✅ Production Ready
