/**
 * POST /api/bbqe/wifi-check
 * FREE TIER (TEMPORARY TESTING) — WiFi Safety Check
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

    const fingerprint = resolveFingerprint(req);

    // Step 1: Get or create user counter (Postgres-persisted)
    const user = await counterDb.getOrCreateCounterUser(fingerprint, 'bbqe');
    if (!user) {
      return res.status(500).json({ error: 'Could not retrieve user counter' });
    }

    // Step 2: Enforce paywall BEFORE doing the work (FREE TIER FOR TESTING)
    if (!user.is_paid && user.uses_remaining <= 0) {
      return res.status(403).json({
        error: 'Free limit reached',
        subscriptionRequired: true,
        checksRemaining: 0
      });
    }

    // Step 3: Analyze the network
    const result = analyzeWiFiThreat(ssid, security || 'UNKNOWN', bssid || null);

    // Step 4: Decrement counter (Postgres-persisted)
    let updated = user;
    if (!user.is_paid) {
      updated = await counterDb.decrementCounter(user.id, 'bbqe');
      if (!updated) {
        console.error('[BBQE] decrement failed for user', user.id);
        updated = user;
      }
    }

    // Step 5: Log usage
    await logUsage(customerId || fingerprint, 'BBQE', 'wifi_check');

    res.json({
      ssid: ssid,
      riskLevel: result.riskLevel,
      score: result.score,
      flags: result.flags,
      recommendation: result.recommendation,
      subscriptionRequired: false,
      checksRemaining: user.is_paid ? 999 : updated.uses_remaining
    });

  } catch (error) {
    console.error('BBQE wifi-check error:', error);
    res.status(500).json({ error: 'Failed to check network' });
  }
});
