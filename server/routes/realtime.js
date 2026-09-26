import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { optionalAuth } from '../middleware/auth.js';
import { createTokenRequest, capabilityFor } from '../realtime.js';

const router = Router();

// GET /api/realtime/token — issue a short-lived Ably token request. Guests get
// a subscribe-only token for the menu channel; signed-in users get their role's
// rights (see capabilityFor).
router.get('/token', optionalAuth, async (req, res) => {
  try {
    const clientId = req.user ? String(req.user.id) : `guest-${randomUUID()}`;
    const tokenRequest = await createTokenRequest({ clientId, capability: capabilityFor(req.user) });
    res.json(tokenRequest);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
