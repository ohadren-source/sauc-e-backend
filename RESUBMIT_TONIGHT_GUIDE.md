# RESUBMIT TONIGHT - FIX & DEPLOY GUIDE

**Timeline:** Deploy backend now → Update apps → Resubmit to Apple tonight → Approved by Wednesday

---

## STEP 1: Deploy Backend (5 minutes)

### Option A: Railway (Recommended - easiest)

1. Go to: https://railway.app/
2. Click "New Project" → "Deploy from GitHub"
3. Create new GitHub repo: `sauc-e-backend`
4. Push these files:
   - `sauc-e-backend.js`
   - `package.json`
   - `.env` (see below)

5. Railway auto-deploys
6. Copy your Railway URL: `https://sauc-e-backend-production.up.railway.app`

### Option B: Heroku (Also easy)

1. Go to: https://heroku.com/
2. Create new app: `sauc-e-backend`
3. Connect GitHub repo
4. Deploy
5. Copy URL: `https://sauc-e-backend.herokuapp.com`

### Option C: Render (Free tier)

1. Go to: https://render.com/
2. New → Web Service
3. Connect GitHub
4. Deploy
5. Copy URL

---

## STEP 2: Create Environment Variables

Create `.env` file in backend folder:

```
PORT=3000
NODE_ENV=production
```

Note: API keys are already hardcoded in `sauc-e-backend.js` (that's the point - they're on backend, not in iOS app)

---

## STEP 3: Update CATSUP App

Replace your current `App.js` with `CATSUP_App_Updated.js`

Key changes:
- Line 10: `const BACKEND_URL = 'https://your-backend-url.herokuapp.com';`
- Remove: `const CLAUDE_API_KEY = ...` (no longer in app)
- Remove: `const REVENUECAT_API_KEY = ...` (backend handles it)
- New function: `handleAskQuestion()` calls `BACKEND_URL/api/catsup/ask-question`

---

## STEP 4: Update BBQE App

Similar to CATSUP:

```javascript
const BACKEND_URL = 'https://your-backend-url.herokuapp.com';

async function handleCheckEmail() {
  const response = await fetch(`${BACKEND_URL}/api/bbqe/check-threat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId: customerId,
      email: emailToCheck
    })
  });
  
  const data = await response.json();
  // Handle isBreach, breachCount, sources
}
```

Remove:
- `const RAPIDAPI_KEY = ...`
- `const REVENUECAT_API_KEY = ...`
- All RapidAPI headers

---

## STEP 5: Update RELISH App

Similar to CATSUP/BBQE:

```javascript
const BACKEND_URL = 'https://your-backend-url.herokuapp.com';

async function handleGetWisdom() {
  const response = await fetch(`${BACKEND_URL}/api/relish/get-wisdom`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId: customerId,
      situation: userSituation,
      context: selectedContext
    })
  });
  
  const data = await response.json();
  // Show data.wisdom (3-sentence answer)
}
```

Remove:
- `const ANTHROPIC_API_KEY = ...`
- `const REVENUECAT_API_KEY = ...`
- All Claude API headers

---

## STEP 6: Test Locally

Before resubmitting to Apple:

1. Run backend locally:
   ```bash
   npm install
   npm start
   ```

2. Update App.js to use `http://localhost:3000` (for testing)

3. Test on Pixel (Android):
   ```bash
   eas build --platform android
   ```

4. Verify endpoints work:
   - Ask a question (CATSUP)
   - Check email (BBQE)
   - Get wisdom (RELISH)

5. Change backend URL back to production (Railway/Heroku)

---

## STEP 7: Rebuild & Resubmit

### CATSUP

```bash
cd catsup
eas build --platform ios --profile production
```

When build completes:
```bash
eas submit --platform ios --latest
```

### BBQE

```bash
cd bbqe
eas build --platform ios --profile production
eas submit --platform ios --latest
```

### RELISH

```bash
cd relish
eas build --platform ios --profile production
eas submit --platform ios --latest
```

---

## STEP 8: What Apple Will See

❌ **Before (REJECTED):**
- `const REVENUECAT_API_KEY = 'sk_...'` in App.js
- `const RAPIDAPI_KEY = 'fe965...'` in App.js
- `const ANTHROPIC_API_KEY = 'sk-ant-...'` in App.js

✅ **After (APPROVED):**
- Only `const BACKEND_URL = 'https://your-domain.com'` in App.js
- App calls backend
- Backend has the secrets (Apple can't see backend)
- No hardcoded secrets in iOS bundle
- Clean, safe code

---

## STEP 9: Apple's Feedback

Apple will likely:
1. Scan the iOS bundle → no API keys found → ✓
2. Check RevenueCat integration → found (public key only) → ✓
3. Approve within 24 hours

---

## TIMELINE

**Tonight:**
- Deploy backend (5 min)
- Update 3 apps (15 min)
- Test locally (10 min)
- Resubmit to Apple (5 min)

**Tuesday:**
- Apple reviews
- Maybe quick feedback

**Wednesday:**
- Approved
- CATSUP/BBQE/RELISH live on App Store

---

## BACKEND ENDPOINTS (For Reference)

### CATSUP
```
POST /api/catsup/ask-question
Content-Type: application/json

{
  "customerId": "user_123",
  "question": "What is entropy?",
  "topic": "Physics"
}

Response:
{
  "answer": "Entropy is...",
  "subscriptionRequired": false,
  "questionsRemaining": 2
}
```

### BBQE
```
POST /api/bbqe/check-threat
Content-Type: application/json

{
  "customerId": "user_123",
  "email": "test@example.com"
}

Response:
{
  "isBreach": true,
  "breachCount": 5,
  "sources": ["Database A", "Database B"],
  "checksRemaining": 4
}
```

### RELISH
```
POST /api/relish/get-wisdom
Content-Type: application/json

{
  "customerId": "user_123",
  "situation": "I'm feeling overwhelmed",
  "context": "Career"
}

Response:
{
  "wisdom": "Three-sentence compressed wisdom...",
  "context": "Career",
  "wisdomRemaining": 9
}
```

---

## DEBUGGING

If something fails:

1. Check backend logs (Railway/Heroku dashboard)
2. Test endpoint with curl:
   ```bash
   curl -X POST https://your-backend.herokuapp.com/api/catsup/ask-question \
     -H "Content-Type: application/json" \
     -d '{"customerId":"test","question":"What is math?","topic":"Math"}'
   ```
3. Check app network requests (Xcode debugger or Charles Proxy)
4. Verify backend URL in App.js is correct

---

## DAYENU

That's enough to ship tonight.

Deploy backend → Update apps → Resubmit → Approved Wednesday.

🔥

