/**
 * SAUC-E UNIFIED BACKEND
 * Serves CATSUP, BBQE, RELISH (all apps share one backend)
 * 
 * All API keys hardcoded here (hidden from iOS app bundle)
 * iOS apps call endpoints instead of using direct API keys
 * 
 * Deploy to: Heroku, Railway, Render (free tier)
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================================
// API KEYS (Hardcoded on backend, hidden from iOS)
// ============================================================================

const API_KEYS = {
  REVENUECAT_CATSUP: process.env.REVENUECAT_CATSUP || 'sk_nsOJvPiovsYGwICqClZwKWyGzuhuY',
  REVENUECAT_BBQE: process.env.REVENUECAT_BBQE || 'sk_YSFYUeoGEPNgMrhANahvlEAzFYCUY',
  REVENUECAT_RELISH: process.env.REVENUECAT_RELISH || 'sk_YSFYUeoGEPNgMrhANahvlEAzFYCUY',
  
  CLAUDE_API: process.env.ANTHROPIC_API_KEY,
  
  RAPIDAPI_KEY: process.env.RAPIDAPI_KEY || 'fe965bb7e9msha1b0b274e7812cdp1856e7jsne86693481c2d',
  RAPIDAPI_HOST: process.env.RAPIDAPI_HOST || 'breachdirectory.p.rapidapi.com'
};

// ============================================================================
// FREE TIER LIMITS
// ============================================================================

const FREE_LIMITS = {
  CATSUP: 3,
  BBQE: 5,
  RELISH: 10
};

// ============================================================================
// USAGE TRACKING (Simple in-memory for MVP, upgrade to DB later)
// ============================================================================

const usageLog = {};

function getUsageCount(customerId, appName) {
  if (!usageLog[customerId] || !usageLog[customerId][appName]) {
    return 0;
  }
  return usageLog[customerId][appName].count;
}

function incrementUsage(customerId, appName) {
  if (!usageLog[customerId]) {
    usageLog[customerId] = {};
  }
  if (!usageLog[customerId][appName]) {
    usageLog[customerId][appName] = { count: 0, lastUsed: null };
  }
  usageLog[customerId][appName].count += 1;
  usageLog[customerId][appName].lastUsed = new Date();
}

// ============================================================================
// SUBSCRIPTION CHECK (RevenueCat server-side verification)
// ============================================================================

async function checkSubscription(customerId, appName) {
  try {
    const rcKey = API_KEYS[`REVENUECAT_${appName}`];
    
    if (!rcKey || !customerId || customerId === 'anonymous') {
      return {
        isSubscribed: false,
        usageCount: getUsageCount(customerId, appName),
        freeLimit: FREE_LIMITS[appName] || 0
      };
    }

    const response = await axios.get(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(customerId)}`,
      {
        headers: {
          'Authorization': `Bearer ${rcKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const entitlements = response.data?.subscriber?.entitlements || {};
    const isSubscribed = entitlements['premium'] && entitlements['premium'].expires_date > new Date().toISOString();

    return {
      isSubscribed: !!isSubscribed,
      usageCount: getUsageCount(customerId, appName),
      freeLimit: FREE_LIMITS[appName] || 0
    };
  } catch (error) {
    console.error(`RevenueCat check error (${appName}):`, error.message);
    return {
      isSubscribed: false,
      usageCount: getUsageCount(customerId, appName),
      freeLimit: FREE_LIMITS[appName] || 0
    };
  }
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ============================================================================
// USAGE STATUS ENDPOINTS (All apps)
// ============================================================================

app.post('/api/catsup/usage-status', async (req, res) => {
  const { customerId } = req.body;
  const status = await checkSubscription(customerId, 'CATSUP');
  res.json({
    usageCount: status.usageCount,
    freeLimit: status.freeLimit,
    remaining: status.isSubscribed ? 999 : Math.max(0, status.freeLimit - status.usageCount),
    isSubscribed: status.isSubscribed
  });
});

app.post('/api/bbqe/usage-status', async (req, res) => {
  const { customerId } = req.body;
  const status = await checkSubscription(customerId, 'BBQE');
  res.json({
    usageCount: status.usageCount,
    freeLimit: status.freeLimit,
    remaining: status.isSubscribed ? 999 : Math.max(0, status.freeLimit - status.usageCount),
    isSubscribed: status.isSubscribed
  });
});

app.post('/api/relish/usage-status', async (req, res) => {
  const { customerId } = req.body;
  const status = await checkSubscription(customerId, 'RELISH');
  res.json({
    usageCount: status.usageCount,
    freeLimit: status.freeLimit,
    remaining: status.isSubscribed ? 999 : Math.max(0, status.freeLimit - status.usageCount),
    isSubscribed: status.isSubscribed
  });
});

// ============================================================================
// CATSUP ENDPOINTS (Learning/Questions)
// ============================================================================

app.post('/api/catsup/ask-question', async (req, res) => {
  try {
    const { customerId, question, topic } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'Question required' });
    }

    // Step 1: Check subscription + usage
    const status = await checkSubscription(customerId, 'CATSUP');
    
    if (!status.isSubscribed && status.usageCount >= FREE_LIMITS.CATSUP) {
      return res.status(403).json({
        error: 'Free limit reached',
        subscriptionRequired: true,
        questionsRemaining: 0
      });
    }

    // Step 2: Ask Claude for answer
    const answer = await askClaude(question, topic);

    // Step 3: Log usage
    incrementUsage(customerId, 'CATSUP');

    const newCount = getUsageCount(customerId, 'CATSUP');

    res.json({
      answer: answer,
      subscriptionRequired: false,
      questionsRemaining: status.isSubscribed ? 999 : Math.max(0, FREE_LIMITS.CATSUP - newCount)
    });

  } catch (error) {
    console.error('CATSUP error:', error);
    res.status(500).json({ error: 'Failed to process question' });
  }
});

// ============================================================================
// BBQE ENDPOINTS (Security/Threat Checks)
// ============================================================================

app.post('/api/bbqe/check-threat', async (req, res) => {
  try {
    const { customerId, email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    // Step 1: Check subscription + usage
    const status = await checkSubscription(customerId, 'BBQE');

    if (!status.isSubscribed && status.usageCount >= FREE_LIMITS.BBQE) {
      return res.status(403).json({
        error: 'Free limit reached',
        subscriptionRequired: true,
        checksRemaining: 0
      });
    }

    // Step 2: Check RapidAPI breach database
    const breachData = await checkRapidAPIThreats(email);

    // Step 3: Log usage
    incrementUsage(customerId, 'BBQE');

    res.json({
      ...breachData,
      subscriptionRequired: false
    });

  } catch (error) {
    console.error('BBQE error:', error);
    res.status(500).json({ error: 'Failed to check threat' });
  }
});

// ============================================================================
// RELISH ENDPOINTS (Wisdom/Feelings)
// ============================================================================

app.post('/api/relish/get-wisdom', async (req, res) => {
  try {
    const { customerId, situation, context } = req.body;

    if (!situation) {
      return res.status(400).json({ error: 'Situation required' });
    }

    // Step 1: Check subscription + usage
    const status = await checkSubscription(customerId, 'RELISH');

    if (!status.isSubscribed && status.usageCount >= FREE_LIMITS.RELISH) {
      return res.status(403).json({
        error: 'Free limit reached',
        subscriptionRequired: true,
        wisdomRemaining: 0
      });
    }

    // Step 2: Get wisdom from Claude
    const wisdom = await getWisdom(situation, context);

    // Step 3: Log usage
    incrementUsage(customerId, 'RELISH');

    const newCount = getUsageCount(customerId, 'RELISH');

    res.json({
      wisdom,
      subscriptionRequired: false,
      wisdomRemaining: status.isSubscribed ? 999 : Math.max(0, FREE_LIMITS.RELISH - newCount)
    });

  } catch (error) {
    console.error('RELISH error:', error);
    res.status(500).json({ error: 'Failed to get wisdom' });
  }
});

// ============================================================================
// SHARED FUNCTIONS
// ============================================================================

async function askClaude(question, topic) {
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `You are a Socratic tutor. Answer this question about ${topic} in a way that teaches understanding, not just facts.

Question: ${question}

Respond in 2-3 sentences that focus on understanding, not memorization.`
          }
        ]
      },
      {
        headers: {
          'x-api-key': API_KEYS.CLAUDE_API,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        }
      }
    );

    return response.data.content[0].text;
  } catch (error) {
    console.error('Claude API error:', error);
    throw error;
  }
}

async function getWisdom(situation, context) {
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: `You are a wisdom guide. For this situation: "${situation}" (context: ${context || 'general life'})

Provide wisdom in exactly THREE sentences. Focus on:
1. What's actually true about this situation
2. What action to take
3. Why it matters

Be compressed. Be profound. Be actionable.`
          }
        ]
      },
      {
        headers: {
          'x-api-key': API_KEYS.CLAUDE_API,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        }
      }
    );

    return response.data.content[0].text;
  } catch (error) {
    console.error('Claude wisdom error:', error);
    throw error;
  }
}

// ============================================================================
// RAPIDAPI THREAT CHECKS (BBQE)
// ============================================================================

async function checkRapidAPIThreats(email) {
  try {
    const response = await axios.get(
      `https://${API_KEYS.RAPIDAPI_HOST}/?func=auto&term=${encodeURIComponent(email)}`,
      {
        headers: {
          'x-rapidapi-key': API_KEYS.RAPIDAPI_KEY,
          'x-rapidapi-host': API_KEYS.RAPIDAPI_HOST
        }
      }
    );

    // Parse response
    const isBreach = response.data && response.data.breaches && response.data.breaches.length > 0;
    
    return {
      isBreach: isBreach,
      breachCount: isBreach ? response.data.breaches.length : 0,
      sources: isBreach ? response.data.breaches.map(b => b.source) : []
    };
  } catch (error) {
    console.error('RapidAPI error:', error);
    // Return safe default if API fails
    return {
      isBreach: false,
      breachCount: 0,
      sources: []
    };
  }
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================================
// START SERVER
// ============================================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🔥 SAUC-E Backend running on port ${PORT}`);
  console.log(`✓ CATSUP endpoint: POST /api/catsup/ask-question`);
  console.log(`✓ CATSUP usage:    POST /api/catsup/usage-status`);
  console.log(`✓ BBQE endpoint:   POST /api/bbqe/check-threat`);
  console.log(`✓ BBQE usage:      POST /api/bbqe/usage-status`);
  console.log(`✓ RELISH endpoint: POST /api/relish/get-wisdom`);
  console.log(`✓ RELISH usage:    POST /api/relish/usage-status`);
  console.log(`✓ Health check:    GET /health`);
  console.log(`✓ Free limits: CATSUP=${FREE_LIMITS.CATSUP}, BBQE=${FREE_LIMITS.BBQE}, RELISH=${FREE_LIMITS.RELISH}`);
});

module.exports = app;
