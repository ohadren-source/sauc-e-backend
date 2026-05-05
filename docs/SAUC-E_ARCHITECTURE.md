# SAUC-E UNIFIED ARCHITECTURE

**Status**: Testing Mode (Stripe Test Products Active)  
**Date**: 2026-05-05  
**Version**: 1.0.0

---

## TABLE OF CONTENTS

1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Component Breakdown](#component-breakdown)
4. [Subscription Lifecycle](#subscription-lifecycle)
5. [Data Model](#data-model)
6. [API Endpoints](#api-endpoints)
7. [Payment Provider Integration](#payment-provider-integration)
8. [Testing Mode Configuration](#testing-mode-configuration)
9. [Dependencies & Libraries](#dependencies--libraries)
10. [Migration Path to Production](#migration-path-to-production)

---

## SYSTEM OVERVIEW

**SAUC-E** is a unified backend serving three independent React/TypeScript applications:

| App | Purpose | Free Tier | Premium Tier | Enterprise Tier |
|-----|---------|-----------|--------------|-----------------|
| **BBQE** | Link Scanner + WiFi Check + Breach Scan | Link Scanner (9 scans) | Link Scanner + WiFi Check | All 3 + Unlimited |
| **CATSUP** | AI-Powered Learning & Questions | Ask Questions (limited) | Unlimited Questions | Custom |
| **RELISH** | Feelings/Emotional Support | Limited Advice | Full Advice Library | VIP Support |

### Architecture Principles

- **Unified Backend**: Single Node.js/Express server handles all 3 apps
- **Fingerprint-Based Identity**: Device fingerprinting via `@sauc-e/fingerprint-manager` (not user accounts)
- **Per-App Counters**: Each device gets separate free tier counters per app (fingerprint + app_name is unique)
- **Persistent Storage**: PostgreSQL for user state, subscriptions, audit logs
- **Multi-Provider Payments**: Stripe, PayPal, Square, RevenueCat support

---

## ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND APPLICATIONS (React/TS)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  BBQE                       CATSUP                     RELISH               │
│  (bbqe-pitboss)             (catsup)                   (relish)             │
│  - Link Scanner (Free)      - Ask Questions (Free)    - Browse (Free)      │
│  - WiFi Check (Premium)     - Learning Path (Free)    - Advice (Premium)   │
│  - Breach Scan (PitBoss)    - Custom Learning (Paid)  - Support (Paid)    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
                ┌───────────────────────────────────────┐
                │   @sauc-e/fingerprint-manager         │
                │   Generates: srv_xxxxxxxxxxxxxxxx    │
                │   Stable device identity              │
                └───────────────────────────────────────┘
                                    ↓
    ┌───────────────────────────────────────────────────────────────┐
    │                   SAUC-E BACKEND                              │
    │             (sauc-e-backend-production.up.railway.app)        │
    │                    Node.js/Express                            │
    ├───────────────────────────────────────────────────────────────┤
    │                                                               │
    │  ✓ POST /api/db/get-subscription-status (UNIFIED)           │
    │    Used by: BBQE, CATSUP, RELISH                            │
    │    Returns: subscription_tier, is_paid, uses_remaining       │
    │                                                               │
    │  ✓ POST /api/bbqe/*                                         │
    │    - /api/bbqe/scan-link                                    │
    │    - /api/bbqe/check-threat                                 │
    │    - /api/bbqe/usage-status (legacy, still supported)       │
    │                                                               │
    │  ✓ POST /api/catsup/*                                       │
    │    - /api/catsup/ask-question                               │
    │    - /api/catsup/usage-status                               │
    │                                                               │
    │  ✓ POST /api/relish/*                                       │
    │    - /api/relish/get-advice                                 │
    │    - /api/relish/usage-status                               │
    │                                                               │
    │  ✓ POST /api/webhooks/stripe                                │
    │    Receives: checkout.session.completed                     │
    │    Actions: Verify, mark paid, update tier                  │
    │                                                               │
    │  ✓ POST /api/webhooks/paypal                                │
    │    Receives: subscription events                            │
    │                                                               │
    │  ✓ GET /health                                              │
    │    Status check endpoint                                    │
    │                                                               │
    └───────────────────────────────────────────────────────────────┘
                    ↓                           ↓
    ┌────────────────────────┐    ┌───────────────────────────────┐
    │   PostgreSQL Database  │    │   Payment Providers           │
    │  (Counter Persistence) │    └───────────────────────────────┘
    ├────────────────────────┤              │
    │ sauce_counter_users    │              ├─ Stripe (Test & Prod)
    │ sauce_counter_actions  │              ├─ PayPal (Test & Prod)
    │ sauce_counter_tracking │              ├─ Square
    │                        │              └─ RevenueCat
    └────────────────────────┘
```

---

## COMPONENT BREAKDOWN

### 1. Frontend Applications

#### BBQE (Link Scanner)
- **Language**: TypeScript + React + Vite
- **Location**: `ohadren-source/bbqe-pitboss`
- **Features**:
  - Free: Link Scanner (9 scans/month)
  - Premium: + WiFi Check (unlimited)
  - PitBoss: + Breach Scan (unlimited)
- **Entry Point**: `src/App.tsx`
- **Key Logic**:
  - Calls `POST /api/db/get-subscription-status` on app load
  - Checks `subscriptionTier` to control tab visibility
  - Decrements counter on each scan if free tier

#### CATSUP (Learning)
- **Language**: TypeScript + React
- **Location**: `ohadren-source/catsup`
- **Features**:
  - Free: Limited questions (9/month)
  - Premium: Unlimited questions
  - School Edition: Custom learning paths

#### RELISH (Feelings/Support)
- **Language**: TypeScript + React
- **Location**: `ohadren-source/relish`
- **Features**:
  - Free: Limited emotional advice
  - Premium: Full advice library + priority support

### 2. FingerprintManager Library

**Purpose**: Generate stable device identifiers across all apps

- **Language**: TypeScript
- **Location**: `ohadren-source/fingerprint-manager`
- **Output**: Stable browser fingerprint (e.g., `srv_abc123def456...`)
- **Usage**: Sent as `fingerprint` or `customerId` in API requests
- **Persistence**: Stored in browser (localStorage/sessionStorage)
- **Uniqueness**: Per-device, not per-user (works offline, no accounts needed)

### 3. Backend: sauc-e-backend

**Language**: Node.js/Express  
**Location**: `ohadren-source/sauc-e-backend`  
**Runtime**: Railway (sauc-e-backend-production.up.railway.app)

#### Key Files

| File | Purpose |
|------|---------|
| `sauc-e-backend.js` | Main Express app, all endpoints |
| `counter-db.js` | PostgreSQL persistence layer |
| `payment-verification.js` | Stripe/PayPal/Square/RevenueCat verification |
| `docs/STRIPE_SUBSCRIPTION_FLOW.md` | Detailed Stripe flow documentation |

#### Main Modules

**1. Counter Management (counter-db.js)**
- Track free tier usage per (fingerprint, app_name)
- Mark users as paid
- Persist subscription tier

**2. Payment Verification (payment-verification.js)**
- Verify Stripe subscriptions with API
- Convert Stripe session ID → subscription ID
- Verify PayPal, Square, RevenueCat subscriptions

**3. API Handlers (sauc-e-backend.js)**
- Unified endpoint: `/api/db/get-subscription-status`
- App-specific endpoints: `/api/bbqe/*`, `/api/catsup/*`, `/api/relish/*`
- Webhook handlers: `/api/webhooks/stripe`, `/api/webhooks/paypal`

### 4. Database: PostgreSQL

**Tables**:

```sql
-- Main counter table
CREATE TABLE sauce_counter_users (
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

-- Audit log
CREATE TABLE sauce_counter_actions (
  id              SERIAL PRIMARY KEY,
  user_id         INT NOT NULL,
  app_name        TEXT NOT NULL,
  action_type     TEXT CHECK (action_type IN ('decrement', 'paid', 'grace_applied')),
  uses_before     INT,
  uses_after      INT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

**Key Design**: `(fingerprint, app_name)` is unique because:
- Same device fingerprint appears across all 3 apps
- Each app gets its own counter row
- Users can have free tier in one app + paid in another

---

## SUBSCRIPTION LIFECYCLE

### Complete Flow: Stripe Checkout → Premium Access

```
STEP 1: USER CLICKS "SUBSCRIBE"
├─ BBQE detects free tier exhausted
├─ Opens Stripe Checkout (product: 'prod_USR6yr2VlSxxuV' or 'prod_USRApCvjUIYe8J')
└─ Redirects to: https://checkout.stripe.com/pay/cs_xxx

STEP 2: STRIPE CHECKOUT COMPLETION
├─ User enters payment details
├─ Payment processed
├─ Stripe creates:
│  ├─ Checkout Session: cs_live_xxx
│  ├─ Subscription: sub_xxx (recurring)
│  └─ Payment Intent: pi_xxx
└─ Stripe redirects back to app with ?subscribed=true&session_id=cs_xxx

STEP 3: APP REDIRECT HANDLER
├─ BBQE detects ?subscribed=true&session_id=cs_xxx
├─ Stores in sessionStorage: { subscription_id: cs_xxx, payment_provider: 'stripe' }
├─ Clears URL (removes query params)
└─ Triggers verification effect

STEP 4: BACKEND VERIFICATION (Manual call)
├─ App calls: POST /api/bbqe/usage-status
│  └─ Body: { customerId: srv_abc123, subscription_id: cs_xxx, payment_provider: 'stripe' }
├─ Backend calls: verifySubscription('stripe', 'cs_xxx')
├─ Converts session ID → subscription ID (calls Stripe API)
└─ Returns subscription: sub_xxx

STEP 5: STRIPE WEBHOOK (Automatic)
├─ Stripe fires: POST /api/webhooks/stripe
│  └─ Event type: checkout.session.completed
│  └─ Payload: { session_id: cs_xxx, subscription: sub_xxx, ... }
├─ Backend verifies subscription is active
└─ Backend calls: markUserPaid(user.id, 'stripe', sub_xxx)

STEP 6: DATABASE UPDATE
├─ Lookup tier: getSubscriptionTier(sub_xxx)
│  └─ Maps to: 'premium-blend-bbqe' or 'pitboss-bbqe'
├─ UPDATE sauce_counter_users SET:
│  ├─ is_paid = TRUE
│  ├─ uses_remaining = 999999
│  ├─ subscription_tier = 'premium-blend-bbqe'
│  ├─ payment_provider = 'stripe'
│  └─ subscription_customer_id = 'sub_xxx'
└─ Persists permanently

STEP 7: NEXT APP LOAD (Later session, same device)
├─ App generates fingerprint: srv_abc123 (same as before)
├─ App calls: POST /api/db/get-subscription-status
│  └─ Body: { fingerprint: srv_abc123, app_name: 'bbqe' }
├─ Backend queries: SELECT * FROM sauce_counter_users 
│  └─ WHERE fingerprint = srv_abc123 AND app_name = 'bbqe'
├─ Backend returns:
│  ├─ subscription_tier: 'premium-blend-bbqe'
│  ├─ is_paid: true
│  └─ uses_remaining: 999999
├─ App checks tier:
│  ├─ if tier === 'premium-blend-bbqe' → WiFi Check tab unlocked ✓
│  └─ if tier === 'pitboss-bbqe' → WiFi Check + Breach Scan unlocked ✓
└─ Premium features available!
```

---

## DATA MODEL

### Subscription Tier Mapping

**File**: `counter-db.js` (lines 11-34)

```javascript
const SUBSCRIPTION_TIER_MAP = {
  // PayPal Plan IDs
  'P-45948399FA681270DNHAH43Y': 'premium-blend-bbqe',
  'P-17886177FN0218458NHAH2JA': 'pitboss-bbqe',
  'P-58676712YW9357247NG6XZXI': 'peak-relish',
  'P-7ES60485XB000951VNG77OZY': 'student-catsup',
  'P-97U37228YV854831UNG77RBA': 'school-catsup',

  // Stripe Product IDs (Test - CURRENTLY ACTIVE)
  'prod_USR6yr2VlSxxuV': 'premium-blend-bbqe',
  'prod_USRApCvjUIYe8J': 'pitboss-bbqe',

  // Stripe Product IDs (Production - TO BE ADDED)
  // 'prod_XXXXXX': 'premium-blend-bbqe',
  // 'prod_YYYYYY': 'pitboss-bbqe',
};
```

### Fingerprint Identity

**Generated by**: `@sauc-e/fingerprint-manager`  
**Format**: `srv_` + 32-character hash  
**Example**: `srv_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`

**Properties**:
- Stable across sessions (stored in browser)
- Device-specific (not tied to user account)
- No PII collected
- Works offline
- Cannot be changed without cache clear

### Request/Response Patterns

#### Unified Endpoint Request
```json
{
  "fingerprint": "srv_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "app_name": "bbqe"
}
```

#### Unified Endpoint Response
```json
{
  "subscription_tier": "premium-blend-bbqe",
  "is_paid": true,
  "uses_remaining": 999999
}
```

#### Legacy Endpoint Request (bbqe/usage-status)
```json
{
  "customerId": "srv_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "subscription_id": "sub_xxx",
  "payment_provider": "stripe"
}
```

#### Legacy Endpoint Response (bbqe/usage-status)
```json
{
  "status": "ok",
  "userId": 123,
  "usageCount": 5,
  "usesRemaining": 4,
  "isPaid": false,
  "subscriptionTier": null
}
```

---

## API ENDPOINTS

### Health Check

```http
GET /health
```

**Response**:
```json
{
  "status": "OK",
  "timestamp": "2026-05-05T04:23:33.022328326Z"
}
```

---

### Unified Subscription Status (NEW)

```http
POST /api/db/get-subscription-status
```

**Called by**: BBQE, CATSUP, RELISH (all apps)

**Request**:
```json
{
  "fingerprint": "srv_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "app_name": "bbqe"
}
```

**Response** (Free Tier):
```json
{
  "subscription_tier": null,
  "is_paid": false,
  "uses_remaining": 8
}
```

**Response** (Premium):
```json
{
  "subscription_tier": "premium-blend-bbqe",
  "is_paid": true,
  "uses_remaining": 999999
}
```

**Response** (PitBoss):
```json
{
  "subscription_tier": "pitboss-bbqe",
  "is_paid": true,
  "uses_remaining": 999999
}
```

---

### BBQE Endpoints

#### Scan Link

```http
POST /api/bbqe/scan-link
```

**Request**:
```json
{
  "customerId": "srv_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "url": "https://example.com/suspicious-link"
}
```

**Response** (Success):
```json
{
  "severity": "HIGH",
  "score": 75,
  "description": "Phishing attack detected",
  "findings": ["Domain impersonation", "SSL certificate mismatch"]
}
```

**Response** (Free Tier Exhausted):
```json
{
  "error": "Free limit reached",
  "subscriptionRequired": true,
  "checksRemaining": 0
}
```

---

#### Usage Status (Legacy)

```http
POST /api/bbqe/usage-status
```

**Request** (Payment Verification):
```json
{
  "customerId": "srv_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
  "subscription_id": "sub_xxx",
  "payment_provider": "stripe"
}
```

**Response**:
```json
{
  "status": "ok",
  "userId": 123,
  "usageCount": 0,
  "usesRemaining": 999999,
  "isPaid": true,
  "subscriptionTier": "premium-blend-bbqe"
}
```

---

### Webhook Endpoints

#### Stripe Webhook

```http
POST /api/webhooks/stripe
```

**Handles Events**:
- `checkout.session.completed` → Mark user as paid, extract subscription tier

**Flow**:
1. Receives checkout session with subscription ID
2. Verifies subscription is active via Stripe API
3. Calls `markUserPaid(user.id, 'stripe', subscription_id)`
4. Tier is automatically looked up and stored

---

#### PayPal Webhook

```http
POST /api/webhooks/paypal
```

**Handles Events**:
- `BILLING.SUBSCRIPTION.CREATED`
- `BILLING.SUBSCRIPTION.UPDATED`

---

### CATSUP Endpoints

#### Ask Question

```http
POST /api/catsup/ask-question
```

**Request**:
```json
{
  "customerId": "srv_xxx",
  "question": "What is photosynthesis?",
  "topic": "Biology"
}
```

---

### RELISH Endpoints

#### Get Advice

```http
POST /api/relish/get-advice
```

**Request**:
```json
{
  "customerId": "srv_xxx",
  "feeling": "anxious",
  "context": "school exam coming up"
}
```

---

## PAYMENT PROVIDER INTEGRATION

### Stripe Configuration (TESTING MODE)

**Test Products Created**:

| Product | Product ID | Plan | Tier |
|---------|-----------|------|------|
| BBQE Premium | `prod_USR6yr2VlSxxuV` | $0.99/month | premium-blend-bbqe |
| BBQE PitBoss | `prod_USRApCvjUIYe8J` | $2.99/month | pitboss-bbqe |

**Subscription Verification Flow**:
1. App calls backend with checkout session ID (`cs_xxx`)
2. Backend calls Stripe API: `GET /v1/checkout/sessions/cs_xxx`
3. Response contains subscription ID (`sub_xxx`)
4. Backend calls: `GET /v1/subscriptions/sub_xxx`
5. Response includes status: `active`, `past_due`, `canceled`
6. Backend stores subscription ID → tier mapping in database

**Webhook Handler**:
- Endpoint: `POST /api/webhooks/stripe`
- Event: `checkout.session.completed`
- Signature Verification: Required (prevents tampering)

### PayPal Configuration

**Plan IDs**:
- Premium BBQE: `P-45948399FA681270DNHAH43Y`
- PitBoss BBQE: `P-17886177FN0218458NHAH2JA`

**Verification**: Backend calls PayPal API to check subscription status

### Square & RevenueCat

**Support**: Code in place for both providers  
**Status**: Not currently configured  
**Plan**: Add IDs when integrating

---

## TESTING MODE CONFIGURATION

### Current Status

**Active Test Products** (Stripe):
- `prod_USR6yr2VlSxxuV` → `premium-blend-bbqe`
- `prod_USRApCvjUIYe8J` → `pitboss-bbqe`

**Test Cards** (Stripe):
- Success: `4242 4242 4242 4242` (exp: any future date, CVC: any 3 digits)
- Requires Auth: `4000 0025 0000 3155`
- Payment Declined: `4000 0000 0000 0002`

### How to Test Full Flow

**1. Local Development**:
```bash
# Start backend
cd sauc-e-backend
npm install
node sauc-e-backend.js

# Start BBQE app
cd bbqe-pitboss
npm install
npm run dev
```

**2. Test Free Tier**:
- Open app
- Scan 9 links
- Verify counter depletes
- On 10th scan, blocked

**3. Test Premium Signup**:
- Click "Upgrade to Premium"
- Select checkout
- Use test card: `4242 4242 4242 4242`
- Complete checkout
- Browser redirects: `?subscribed=true&session_id=cs_xxx`
- App sends to backend: `POST /api/bbqe/usage-status` with session_id
- Backend webhook also fires (automatic)
- Refresh app → verify tier is `premium-blend-bbqe`
- WiFi Check tab now unlocked

**4. Verify Database**:
```sql
SELECT * FROM sauce_counter_users 
WHERE fingerprint = 'srv_...' AND app_name = 'bbqe';
```

Expected output:
```
is_paid: true
subscription_tier: premium-blend-bbqe
subscription_customer_id: sub_xxx
```

---

## DEPENDENCIES & LIBRARIES

### Frontend (BBQE)

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@sauc-e/fingerprint-manager": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vite": "^4.0.0"
  }
}
```

### Backend (sauc-e-backend)

```json
{
  "dependencies": {
    "express": "^4.18.0",
    "pg": "^8.8.0",
    "axios": "^1.3.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {}
}
```

### External APIs

| Service | Purpose | Endpoint |
|---------|---------|----------|
| Stripe API | Payment verification | `https://api.stripe.com/v1/` |
| PayPal API | Subscription verification | `https://api.paypal.com/v1/` |
| RapidAPI (Breach Directory) | Email breach checking | `https://breachdirectory.p.rapidapi.com/` |
| Anthropic (Claude) | AI responses (CATSUP) | `https://api.anthropic.com/` |

---

## MIGRATION PATH TO PRODUCTION

### Phase 1: Testing Verification ✓ (Current)

**Checklist**:
- [ ] Free tier counter depletion working
- [ ] Premium signup flow complete
- [ ] Stripe webhook firing correctly
- [ ] Database updating with correct tier
- [ ] App recognizes subscription on next load
- [ ] Premium tabs unlocking as expected
- [ ] WiFi Check and Breach Scan working for premium users
- [ ] All 3 apps (BBQE, CATSUP, RELISH) working in parallel

### Phase 2: Production Setup

**1. Get Production Stripe Product IDs**:
- Go to Stripe Dashboard
- Create production products (non-test)
- Record product IDs

**2. Update Backend** (`counter-db.js`):
```javascript
const SUBSCRIPTION_TIER_MAP = {
  // Test (existing)
  'prod_USR6yr2VlSxxuV': 'premium-blend-bbqe',
  'prod_USRApCvjUIYe8J': 'pitboss-bbqe',

  // Production (NEW)
  'prod_XXXXXXX_LIVE': 'premium-blend-bbqe',
  'prod_YYYYYYY_LIVE': 'pitboss-bbqe',
};
```

**3. Configure Environment** (Railway):
```
STRIPE_API_KEY=sk_live_xxxxxxxxxxxx  (live key, not test)
DATABASE_URL=postgresql://...        (production DB)
NODE_ENV=production
```

**4. Deploy**:
```bash
git push  # Triggers Railway deployment
```

**5. Verify Production**:
- Test with real Stripe products
- Monitor webhook logs
- Verify users can subscribe
- Check database for new subscriptions

### Phase 3: Cutover

**Decision Point**: When confident testing is stable:
1. Update payment links to point to production Stripe
2. Announce to users
3. Monitor for issues
4. Keep test products active for internal testing

---

## TROUBLESHOOTING

### Common Issues

**Issue**: User paid but tabs still locked  
**Cause**: Tier mapping missing in database  
**Fix**: Add production Stripe product IDs to `SUBSCRIPTION_TIER_MAP`

**Issue**: Webhook not firing  
**Cause**: Endpoint URL not configured in Stripe  
**Fix**: Stripe Dashboard → Developers → Webhooks → Add endpoint: `https://sauc-e-backend-production.up.railway.app/api/webhooks/stripe`

**Issue**: "Could not retrieve user" error  
**Cause**: Database connection failed  
**Fix**: Check `DATABASE_URL` environment variable, verify PostgreSQL is running

**Issue**: Free counter not decrementing  
**Cause**: `is_paid` incorrectly set to true  
**Fix**: Verify user isn't accidentally marked as paid, check database directly

---

## GLOSSARY

| Term | Definition |
|------|-----------|
| **Fingerprint** | Stable device identifier generated by @sauc-e/fingerprint-manager |
| **Subscription Tier** | Premium level: null (free), premium-blend-bbqe, pitboss-bbqe, etc. |
| **Counter** | Free tier usage tracker (0-9 uses per app per device) |
| **Webhook** | Event notification from payment provider to backend |
| **Session ID** | Temporary Stripe checkout session identifier (cs_xxx) |
| **Subscription ID** | Recurring billing identifier (sub_xxx) |
| **App Name** | Application identifier: bbqe, catsup, or relish |
| **is_paid** | Boolean flag: true if user has active subscription |
| **uses_remaining** | Number of free scans/questions left (0-9, or 999999 if paid) |

---

## DOCUMENT VERSION HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-05-05 | Copilot | Initial comprehensive architecture document |

---

## NEXT STEPS

1. **Complete Testing Phase**:
   - Test all 3 apps together
   - Verify tier isolation (free in one app, paid in another)
   - Test subscription cancellation handling

2. **Performance & Security**:
   - Load test: 1000+ concurrent users
   - Security audit: SQL injection, payment tampering, auth bypass
   - Rate limiting: Prevent abuse of free tier

3. **Production Launch**:
   - Get production Stripe product IDs
   - Update backend mapping
   - Deploy to production
   - Monitor logs for 24 hours

4. **Future Enhancements**:
   - User accounts (optional, currently fingerprint-only)
   - Subscription management UI (pause, cancel, upgrade/downgrade)
   - Analytics dashboard
   - Multi-currency pricing
