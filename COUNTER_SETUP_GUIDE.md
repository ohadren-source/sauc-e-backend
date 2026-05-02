# Counter Persistence System — sauc-e-backend

## What Was Built

Three new files for the persistent counter system:

### 1. **counter-db.js**
Database layer using PostgreSQL (pg package). Handles:
- `getOrCreateCounterUser()` — fingerprint + app → user record
- `decrementCounter()` — reduce uses, log action
- `markUserPaid()` — store subscription info
- `getCounterUser()` — retrieve existing user
- `updateSubscriptionStatus()` — sync payment status

### 2. **payment-verification.js**
Verify subscriptions across three payment providers:
- `verifyStripeSubscription()` — query Stripe API
- `verifyPayPalSubscription()` — query PayPal API
- `verifySquareSubscription()` — query Square API
- `verifySubscription()` — unified interface

### 3. **COUNTER_ENDPOINTS.js** (Reference)
Example endpoints to add to sauc-e-backend.js:
- `POST /api/{app}/usage-status` — get/create user + verify subscription
- `POST /api/{app}/decrement` — decrement uses after action

## Database Schema

Two tables created automatically on startup:

```sql
sauce_counter_users
├── id (PK)
├── fingerprint (UNIQUE)
├── app_name (bbqe|catsup|relish)
├── demo_started_at
├── uses_remaining (0-9, or 999999 if paid)
├── is_paid
├── payment_provider (stripe|paypal|square|revenuecat)
├── subscription_customer_id
├── paid_at
└── timestamps (created_at, updated_at)

sauce_counter_actions (audit log)
├── id (PK)
├── user_id (FK)
├── app_name
├── action_type (decrement|paid|grace_applied)
├── uses_before / uses_after
└── created_at
```

## Installation Steps

### 1. Install PostgreSQL package
```bash
npm install pg
```

### 2. Add to sauc-e-backend.js (top of file, after requires)
```javascript
const counterDb = require('./counter-db');
const paymentVerification = require('./payment-verification');

// On startup, after other initialization:
counterDb.ensureCounterTables();
```

### 3. Add .env variables (already in Railway, but for reference)
```
DATABASE_URL=postgresql://postgres:YOxLrCkomCiXdgpuuTgDOFAhRJJuexNQ@postgres.railway.internal:5432/railway

STRIPE_API_KEY=sk_live_...
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
SQUARE_ACCESS_TOKEN=sq_live_...
```

**Note:** DATABASE_URL is already set in your Railway environment. Verify in the Variables tab if needed.

### 4. Add counter endpoints to sauc-e-backend.js
Copy the three `/api/{app}/usage-status` routes from COUNTER_ENDPOINTS.js
Copy the `/api/{app}/decrement` routes (one per app)

### 5. Update frontend apps to use fingerprinting

Each app needs to:
1. Generate or retrieve browser fingerprint
2. On mount: `POST /api/{app}/usage-status` with fingerprint
3. After successful action: `POST /api/{app}/decrement` with userId
4. After payment redirect: `POST /api/{app}/usage-status` with fingerprint + payment_provider + subscription_id

## Flow

### Web App (Browser Fingerprint)
```
App loads → Generate fingerprint
         → POST /api/{app}/usage-status { fingerprint }
         → Get userId + usesRemaining + isPaid
         
User performs action (scan/question/wisdom)
         → POST /api/{app}/scan-link (or get-lesson, etc.)
         → If success: POST /api/{app}/decrement { userId }
         → Get updated usesRemaining
         
If hits 0 → Show paywall → Redirect to Stripe/PayPal/Square

User completes payment → Redirected back to app with subscription_id
         → POST /api/{app}/usage-status { fingerprint, payment_provider, subscription_id }
         → Backend verifies subscription
         → User gets unlimited access
```

### iOS/Android (RevenueCat)
```
Currently uses customerId (RevenueCat customer ID)
Same endpoints can work by passing customerId as fingerprint
RevenueCat verification can be added later
```

## Payment Verification

When user returns from payment with subscription data:
1. Backend calls `verifySubscription(provider, subscriptionId)`
2. Provider's API is queried to confirm subscription is ACTIVE
3. If active: `is_paid = TRUE`, `uses_remaining = 999999`
4. If expired/canceled: `is_paid = FALSE`, back to free tier

## Testing

```bash
# Create a test user (web app flow)
curl -X POST http://localhost:5000/api/bbqe/usage-status \
  -H "Content-Type: application/json" \
  -d '{"fingerprint":"test-fp-123"}'

# Decrement their counter
curl -X POST http://localhost:5000/api/bbqe/decrement \
  -H "Content-Type: application/json" \
  -d '{"userId":1}'

# Simulate paid subscription
curl -X POST http://localhost:5000/api/bbqe/usage-status \
  -H "Content-Type: application/json" \
  -d '{
    "fingerprint":"test-fp-123",
    "payment_provider":"stripe",
    "subscription_id":"sub_xxxxx"
  }'
```

## Next Steps

1. ✅ Database layer (counter-db.js)
2. ✅ Payment verification (payment-verification.js)
3. ✅ Backend endpoints reference (COUNTER_ENDPOINTS.js)
4. ⏳ Integrate endpoints into sauc-e-backend.js
5. ⏳ Add browser fingerprinting to frontend apps (fingerprintjs or custom)
6. ⏳ Modify frontend apps to call counter endpoints
7. ⏳ Test payment redirect + subscription verification

---

**Notes:**
- Browser fingerprint generation: use `fingerprintjs2` library or build custom (User-Agent + screen resolution + canvas)
- For iOS/Android: currently uses `customerId` (RevenueCat) — can use same counter system by treating RevenueCat ID as fingerprint
- Graceful fallback: if payment verification fails, counter still works (just won't mark as paid)
