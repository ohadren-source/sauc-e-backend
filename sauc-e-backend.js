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

// ---------- KNOWN THREAT PATTERNS (Link Scanner) ----------

const SUSPICIOUS_TLDS = [
  '.xyz', '.top', '.buzz', '.club', '.icu', '.cam', '.rest',
  '.surf', '.monster', '.site', '.website', '.space', '.pw',
  '.tk', '.ml', '.ga', '.cf', '.gq', '.cc', '.ws'
];

const PHISHING_KEYWORDS = [
  'login', 'signin', 'verify', 'secure', 'account', 'update',
  'confirm', 'banking', 'password', 'credential', 'suspended',
  'unusual', 'limited', 'restore', 'unlock', 'authenticate',
  'wallet', 'crypto', 'airdrop', 'claim', 'reward', 'winner',
  'prize', 'gift-card', 'free-money', 'urgent', 'immediately'
];

const IMPERSONATION_TARGETS = [
  'google', 'apple', 'microsoft', 'amazon', 'paypal', 'netflix',
  'facebook', 'instagram', 'whatsapp', 'chase', 'wellsfargo',
  'bankofamerica', 'citibank', 'usps', 'fedex', 'ups', 'dhl',
  'irs', 'coinbase', 'binance', 'venmo', 'zelle', 'cashapp'
];

const KNOWN_SAFE_DOMAINS = [
  'google.com', 'apple.com', 'microsoft.com', 'amazon.com',
  'paypal.com', 'netflix.com', 'facebook.com', 'instagram.com',
  'github.com', 'stackoverflow.com', 'wikipedia.org', 'reddit.com',
  'youtube.com', 'twitter.com', 'x.com', 'linkedin.com',
  'chase.com', 'wellsfargo.com', 'bankofamerica.com',
  'usps.com', 'fedex.com', 'ups.com'
];

const SUSPICIOUS_WIFI_PATTERNS = [
  'free', 'open', 'guest', 'public', 'airport', 'hotel',
  'cafe', 'coffee', 'starbucks', 'mcdonalds', 'xfinity',
  'attwifi', 'setup', 'config', 'admin', 'default', 'linksys',
  'netgear', 'dlink', 'test', 'tmp', 'temp'
];

/**
 * POST /api/bbqe/scan-link
 * FREE TIER — Link Scanner
 * 
 * Analyzes a URL for phishing, malware indicators, impersonation,
 * suspicious TLDs, excessive subdomains, and known bad patterns.
 * No external API needed — pure signal detection from noise.
 * 
 * Request:
 * {
 *   "customerId": "user_123",
 *   "url": "https://g00gle-secure-login.xyz/verify"
 * }
 * 
 * Response:
 * {
 *   "url": "https://g00gle-secure-login.xyz/verify",
 *   "threatLevel": "HIGH",
 *   "score": 85,
 *   "flags": [...],
 *   "summary": "This link shows multiple signs of phishing..."
 * }
 */

app.post('/api/bbqe/scan-link', async (req, res) => {
  try {
    const { customerId, url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }

    // Step 1: Check usage (free tier — 5 free scans)
    const subscriptionStatus = await checkSubscription(customerId, 'BBQE');

    if (!subscriptionStatus.isSubscribed && subscriptionStatus.checksUsed >= 5) {
      return res.status(403).json({
        error: 'Free limit reached',
        subscriptionRequired: true
      });
    }

    // Step 2: Analyze the URL
    const result = analyzeLinkThreat(url);

    // Step 3: Log usage
    await logUsage(customerId, 'BBQE', 'link_scan');

    res.json({
      url: url,
      threatLevel: result.threatLevel,
      score: result.score,
      flags: result.flags,
      summary: result.summary,
      subscriptionRequired: false,
      checksRemaining: subscriptionStatus.isSubscribed ? 999 : (5 - subscriptionStatus.checksUsed - 1)
    });

  } catch (error) {
    console.error('BBQE link-scan error:', error);
    res.status(500).json({ error: 'Failed to scan link' });
  }
});

function analyzeLinkThreat(rawUrl) {
  const flags = [];
  let score = 0;

  // Normalize
  let url = rawUrl.trim();
  if (!url.match(/^https?:\/\//i)) {
    url = 'http://' + url;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return {
      threatLevel: 'HIGH',
      score: 90,
      flags: ['Invalid or malformed URL — cannot be parsed safely.'],
      summary: 'This URL is malformed and should not be opened.'
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  const fullPath = parsed.pathname.toLowerCase() + parsed.search.toLowerCase();
  const parts = hostname.split('.');

  // --- Check 1: Known safe domain (exact match) ---
  const rootDomain = parts.slice(-2).join('.');
  if (KNOWN_SAFE_DOMAINS.includes(rootDomain)) {
    // Could still be a subdomain trick like login.google.com.evil.xyz
    if (parts.length <= 3) {
      return {
        threatLevel: 'LOW',
        score: 5,
        flags: ['Recognized domain: ' + rootDomain],
        summary: 'This link points to a known, trusted domain.'
      };
    }
  }

  // --- Check 2: Suspicious TLD ---
  for (const tld of SUSPICIOUS_TLDS) {
    if (hostname.endsWith(tld)) {
      flags.push('Suspicious domain extension: ' + tld);
      score += 20;
      break;
    }
  }

  // --- Check 3: Excessive subdomains (3+ = hiding something) ---
  if (parts.length >= 4) {
    flags.push('Excessive subdomains (' + parts.length + ' levels) — often used to disguise the real destination.');
    score += 15;
  }

  // --- Check 4: Impersonation detection ---
  for (const target of IMPERSONATION_TARGETS) {
    if (hostname.includes(target) && !KNOWN_SAFE_DOMAINS.includes(rootDomain)) {
      flags.push('Possible impersonation of ' + target + ' — domain is not the official site.');
      score += 30;
      break;
    }
  }

  // --- Check 5: Phishing keywords in URL path ---
  const matchedKeywords = [];
  for (const keyword of PHISHING_KEYWORDS) {
    if (hostname.includes(keyword) || fullPath.includes(keyword)) {
      matchedKeywords.push(keyword);
    }
  }
  if (matchedKeywords.length > 0) {
    flags.push('Phishing keywords detected: ' + matchedKeywords.slice(0, 3).join(', '));
    score += Math.min(matchedKeywords.length * 10, 25);
  }

  // --- Check 6: IP address instead of domain ---
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    flags.push('URL uses a raw IP address instead of a domain name.');
    score += 25;
  }

  // --- Check 7: Unusual port ---
  if (parsed.port && !['80', '443', ''].includes(parsed.port)) {
    flags.push('Non-standard port: ' + parsed.port + ' — legitimate sites rarely use custom ports.');
    score += 10;
  }

  // --- Check 8: HTTP instead of HTTPS ---
  if (parsed.protocol === 'http:') {
    flags.push('No encryption (HTTP) — data sent to this site is not secure.');
    score += 10;
  }

  // --- Check 9: Homoglyph / character substitution ---
  if (/[0-9]/.test(hostname.replace(/[0-9]+\./g, ''))) {
    // Numbers embedded in what looks like a word (g00gle, amaz0n)
    const stripped = hostname.replace(/\.[^.]+$/, '');
    if (/[a-z][0-9]|[0-9][a-z]/i.test(stripped)) {
      flags.push('Possible character substitution in domain (e.g., g00gle, amaz0n).');
      score += 20;
    }
  }

  // --- Check 10: Very long URL (obfuscation) ---
  if (url.length > 200) {
    flags.push('Unusually long URL (' + url.length + ' characters) — may be hiding the real destination.');
    score += 10;
  }

  // Cap score at 100
  score = Math.min(score, 100);

  // Determine threat level
  let threatLevel;
  let summary;

  if (score >= 60) {
    threatLevel = 'HIGH';
    summary = 'This link shows multiple signs of being malicious. Do not click or enter any personal information.';
  } else if (score >= 30) {
    threatLevel = 'MEDIUM';
    summary = 'This link has some suspicious characteristics. Proceed with caution and verify the source.';
  } else if (score > 0) {
    threatLevel = 'LOW';
    summary = 'This link has minor concerns but appears mostly safe. Stay aware.';
  } else {
    threatLevel = 'CLEAN';
    summary = 'No obvious threats detected in this link.';
  }

  if (flags.length === 0) {
    flags.push('No suspicious patterns detected.');
  }

  return { threatLevel, score, flags, summary };
}

/**
 * POST /api/bbqe/wifi-check
 * PREMIUM TIER — WiFi Safety Check
 * 
 * Analyzes a WiFi network name (SSID) and optional details for
 * honeypot patterns, impersonation, evil twin risks, and security issues.
 * 
 * Request:
 * {
 *   "customerId": "user_123",
 *   "ssid": "Free_Airport_WiFi",
 *   "security": "OPEN",
 *   "bssid": "AA:BB:CC:DD:EE:FF"
 * }
 * 
 * Response:
 * {
 *   "ssid": "Free_Airport_WiFi",
 *   "riskLevel": "HIGH",
 *   "score": 75,
 *   "flags": [...],
 *   "recommendation": "Do not connect..."
 * }
 */

app.post('/api/bbqe/wifi-check', async (req, res) => {
  try {
    const { customerId, ssid, security, bssid } = req.body;

    if (!ssid) {
      return res.status(400).json({ error: 'Network name (SSID) required' });
    }

    // Step 1: Check subscription (premium only)
    const subscriptionStatus = await checkSubscription(customerId, 'BBQE');

    if (!subscriptionStatus.isSubscribed) {
      return res.status(403).json({
        error: 'WiFi Check requires Premium subscription',
        subscriptionRequired: true
      });
    }

    // Step 2: Analyze the network
    const result = analyzeWiFiThreat(ssid, security || 'UNKNOWN', bssid || null);

    // Step 3: Log usage
    await logUsage(customerId, 'BBQE', 'wifi_check');

    res.json({
      ssid: ssid,
      riskLevel: result.riskLevel,
      score: result.score,
      flags: result.flags,
      recommendation: result.recommendation,
      subscriptionRequired: false
    });

  } catch (error) {
    console.error('BBQE wifi-check error:', error);
    res.status(500).json({ error: 'Failed to check network' });
  }
});

function analyzeWiFiThreat(ssid, security, bssid) {
  const flags = [];
  let score = 0;
  const ssidLower = ssid.toLowerCase().replace(/[\s_\-]/g, '');

  // --- Check 1: Open / No encryption ---
  const secUpper = security.toUpperCase();
  if (secUpper === 'OPEN' || secUpper === 'NONE' || secUpper === '') {
    flags.push('Network has no password — all traffic is visible to anyone nearby.');
    score += 30;
  } else if (secUpper === 'WEP') {
    flags.push('WEP encryption is outdated and easily cracked. Treat as unprotected.');
    score += 25;
  } else if (secUpper.includes('WPA3')) {
    // Good
  } else if (secUpper.includes('WPA2')) {
    // Acceptable
  } else if (secUpper.includes('WPA')) {
    flags.push('WPA (v1) encryption has known vulnerabilities. WPA2 or WPA3 is recommended.');
    score += 10;
  }

  // --- Check 2: Suspicious name patterns (honeypot bait) ---
  for (const pattern of SUSPICIOUS_WIFI_PATTERNS) {
    if (ssidLower.includes(pattern)) {
      flags.push('Network name contains "' + pattern + '" — common in honeypot or rogue networks.');
      score += 15;
      break;
    }
  }

  // --- Check 3: Impersonation of known brands ---
  for (const target of IMPERSONATION_TARGETS.slice(0, 12)) {
    if (ssidLower.includes(target)) {
      flags.push('Network name references "' + target + '" — verify this is the official network before connecting.');
      score += 20;
      break;
    }
  }

  // --- Check 4: Generic / default names ---
  const genericNames = ['linksys', 'netgear', 'dlink', 'default', 'setup', 'home', 'router', 'wifi'];
  for (const name of genericNames) {
    if (ssidLower === name || ssidLower === name + '5g' || ssidLower === name + '2g') {
      flags.push('Default router name — indicates the network was never properly configured.');
      score += 10;
      break;
    }
  }

  // --- Check 5: Hidden SSID note ---
  if (ssid.trim() === '' || ssid === '(hidden)') {
    flags.push('Hidden network — can be legitimate privacy measure or used to avoid detection.');
    score += 5;
  }

  // --- Check 6: "Free" + brand combo (evil twin classic) ---
  const hasFree = ssidLower.includes('free');
  const hasBrand = IMPERSONATION_TARGETS.some(t => ssidLower.includes(t));
  if (hasFree && hasBrand) {
    flags.push('Combines "free" with a brand name — classic evil twin / honeypot pattern.');
    score += 25;
  }

  // --- Check 7: Very long or suspicious characters in SSID ---
  if (ssid.length > 32) {
    flags.push('Unusually long network name — may be attempting to mimic or confuse.');
    score += 10;
  }

  // Cap at 100
  score = Math.min(score, 100);

  // Determine risk level
  let riskLevel;
  let recommendation;

  if (score >= 60) {
    riskLevel = 'HIGH';
    recommendation = 'Do not connect to this network. If you must, use a VPN and avoid entering any passwords or personal information.';
  } else if (score >= 30) {
    riskLevel = 'MEDIUM';
    recommendation = 'Proceed with caution. Use a VPN if possible and avoid sensitive activities like banking.';
  } else if (score > 0) {
    riskLevel = 'LOW';
    recommendation = 'Network appears mostly safe. Standard precautions apply.';
  } else {
    riskLevel = 'SAFE';
    recommendation = 'No red flags detected. Normal security practices recommended.';
  }

  if (flags.length === 0) {
    flags.push('No suspicious patterns detected in this network.');
  }

  return { riskLevel, score, flags, recommendation };
}

/**
 * POST /api/bbqe/check-threat
 * PITBOSS TIER — Breach Scanner
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

    // Step 1: Check subscription (PitBoss only)
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

/**
 * POST /api/bbqe/usage-status
 * Returns current usage count for a customer
 */

app.post('/api/bbqe/usage-status', async (req, res) => {
  try {
    const { customerId } = req.body;
    const cid = customerId || 'anonymous';

    const usage = usageLog[cid] && usageLog[cid]['BBQE']
      ? usageLog[cid]['BBQE'].count
      : 0;

    const subscriptionStatus = await checkSubscription(cid, 'BBQE');

    res.json({
      usageCount: usage,
      freeLimit: 5,
      remaining: subscriptionStatus.isSubscribed ? 999 : Math.max(0, 5 - usage),
      isSubscribed: subscriptionStatus.isSubscribed
    });
  } catch (error) {
    console.error('BBQE usage-status error:', error);
    res.json({ usageCount: 0, freeLimit: 5, remaining: 5, isSubscribed: false });
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
  console.log(`SAUC-E Backend running on port ${PORT}`);
  console.log(`CATSUP endpoint: POST /api/catsup/ask-question`);
  console.log(`BBQE endpoints:`);
  console.log(`  - POST /api/bbqe/scan-link (Free: Link Scanner)`);
  console.log(`  - POST /api/bbqe/wifi-check (Premium: WiFi Safety)`);
  console.log(`  - POST /api/bbqe/check-threat (PitBoss: Breach Scanner)`);
  console.log(`  - POST /api/bbqe/usage-status`);
  console.log(`RELISH endpoint: POST /api/relish/get-wisdom`);
  console.log(`Health check: GET /health`);
});

module.exports = app;
