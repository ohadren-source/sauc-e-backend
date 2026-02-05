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
  
  CLAUDE_API: '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',
  
  RAPIDAPI_KEY: process.env.RAPIDAPI_KEY || 'fe965bb7e9msha1b0b274e7812cdp1856e7jsne86693481c2d',
  RAPIDAPI_HOST: process.env.RAPIDAPI_HOST || 'breachdirectory.p.rapidapi.com'
};

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ============================================================================
// CATSUP ENDPOINTS (Learning/Questions)
// ============================================================================

/**
 * POST /api/catsup/ask-question
 * 
 * Request:
 * {
 *   "customerId": "user_123",
 *   "question": "What is the Pythagorean theorem?",
 *   "topic": "Mathematics"
 * }
 * 
 * Response:
 * {
 *   "answer": "The Pythagorean theorem states...",
 *   "subscriptionRequired": false,
 *   "questionsRemaining": 2
 * }
 */

app.post('/api/catsup/ask-question', async (req, res) => {
  try {
    const { customerId, question, topic } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'Question required' });
    }

    // Step 1: Check subscription via RevenueCat
    const subscriptionStatus = await checkSubscription(customerId, 'CATSUP');
    
    if (!subscriptionStatus.isSubscribed && subscriptionStatus.questionsUsed >= 3) {
      return res.status(403).json({
        error: 'Free limit reached',
        subscriptionRequired: true,
        questionsRemaining: 0
      });
    }

    // Step 2: Ask Claude for answer
    const answer = await askClaude(question, topic);

    // Step 3: Log question usage
    await logUsage(customerId, 'CATSUP', 'question');

    res.json({
      answer: answer,
      subscriptionRequired: false,
      questionsRemaining: subscriptionStatus.isSubscribed ? 999 : (3 - subscriptionStatus.questionsUsed - 1)
    });

  } catch (error) {
    console.error('CATSUP error:', error);
    res.status(500).json({ error: 'Failed to process question' });
  }
});

// ============================================================================
// BBQE ENDPOINTS (Security/Threat Checks)
// ============================================================================

/**
 * POST /api/bbqe/check-threat
 * 
 * Request:
 * {
 *   "customerId": "user_123",
 *   "email": "test@example.com"
 * }
 * 
 * Response:
 * {
 *   "isBreach": true/false,
 *   "breachCount": 5,
 *   "sources": ["Database A", "Database B"],
 *   "subscriptionRequired": false
 * }
 */

app.post('/api/bbqe/check-threat', async (req, res) => {
  try {
    const { customerId, email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    // Step 1: Check subscription
    const subscriptionStatus = await checkSubscription(customerId, 'BBQE');
    
    if (!subscriptionStatus.isSubscribed && subscriptionStatus.checksUsed >= 5) {
      return res.status(403).json({
        error: 'Free limit reached',
        subscriptionRequired: true
      });
    }

    // Step 2: Check RapidAPI threat databases
    const threatResult = await checkRapidAPIThreats(email);

    // Step 3: Log check usage
    await logUsage(customerId, 'BBQE', 'threat_check');

    res.json({
      isBreach: threatResult.isBreach,
      breachCount: threatResult.breachCount,
      sources: threatResult.sources,
      subscriptionRequired: false,
      checksRemaining: subscriptionStatus.isSubscribed ? 999 : (5 - subscriptionStatus.checksUsed - 1)
    });

  } catch (error) {
    console.error('BBQE error:', error);
    res.status(500).json({ error: 'Failed to check threats' });
  }
});

// ============================================================================
// RELISH ENDPOINTS (Wellness/Wisdom)
// ============================================================================

/**
 * POST /api/relish/get-wisdom
 * 
 * Request:
 * {
 *   "customerId": "user_123",
 *   "situation": "I'm feeling overwhelmed at work",
 *   "context": "Career"
 * }
 * 
 * Response:
 * {
 *   "wisdom": "Three-sentence compressed wisdom...",
 *   "tracks": ["Track #2", "Track #37"],
 *   "subscriptionRequired": false
 * }
 */

app.post('/api/relish/get-wisdom', async (req, res) => {
  try {
    const { customerId, situation, context } = req.body;

    if (!situation) {
      return res.status(400).json({ error: 'Situation required' });
    }

    // Step 1: Check subscription
    const subscriptionStatus = await checkSubscription(customerId, 'RELISH');
    
    if (!subscriptionStatus.isSubscribed && subscriptionStatus.wisdomUsed >= 10) {
      return res.status(403).json({
        error: 'Free limit reached',
        subscriptionRequired: true
      });
    }

    // Step 2: Ask Claude for wisdom (3-sentence compression)
    const wisdom = await getWisdom(situation, context);

    // Step 3: Log wisdom usage
    await logUsage(customerId, 'RELISH', 'wisdom');

    res.json({
      wisdom: wisdom,
      context: context,
      subscriptionRequired: false,
      wisdomRemaining: subscriptionStatus.isSubscribed ? 999 : (10 - subscriptionStatus.wisdomUsed - 1)
    });

  } catch (error) {
    console.error('RELISH error:', error);
    res.status(500).json({ error: 'Failed to get wisdom' });
  }
});

// ============================================================================
// REVENUECAT SUBSCRIPTION CHECK
// ============================================================================

async function checkSubscription(customerId, app) {
  try {
    // For now, return mock data
    // In production: actually call RevenueCat API
    
    return {
      isSubscribed: false,
      questionsUsed: 0,
      checksUsed: 0,
      wisdomUsed: 0
    };
  } catch (error) {
    console.error('Subscription check error:', error);
    return { isSubscribed: false };
  }
}

// ============================================================================
// CLAUDE API CALLS (CATSUP & RELISH)
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
            content: `You are a Socratic tutor. Answer this question about ${topic || 'general knowledge'} in a way that teaches understanding, not just facts.\n\nQuestion: ${question}\n\nRespond in 2-3 sentences that focus on understanding, not memorization.`
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
// USAGE LOGGING (Simple in-memory for MVP, upgrade to DB later)
// ============================================================================

const usageLog = {};

async function logUsage(customerId, app, action) {
  if (!usageLog[customerId]) {
    usageLog[customerId] = {};
  }
  if (!usageLog[customerId][app]) {
    usageLog[customerId][app] = { count: 0, lastUsed: null };
  }
  
  usageLog[customerId][app].count += 1;
  usageLog[customerId][app].lastUsed = new Date();
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
  console.log(`✓ BBQE endpoint: POST /api/bbqe/check-threat`);
  console.log(`✓ RELISH endpoint: POST /api/relish/get-wisdom`);
  console.log(`✓ Health check: GET /health`);
});

module.exports = app;
