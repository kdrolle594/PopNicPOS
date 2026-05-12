import { Router } from 'express';
import { jwtCheck, loadUser } from '../middleware/auth.js';
import { createTokenRequest } from '../realtime.js';

const router = Router();

// GET /api/realtime/token — issue a short-lived Ably token request for the
// authenticated user. Drivers may publish on delivery channels; everyone else
// is subscribe-only.
router.get('/token', jwtCheck, loadUser, async (req, res) => {
  try {
    const isDriver = req.user.role === 'driver';
    const capability = isDriver
      ? { 'delivery:*': ['publish', 'subscribe'], orders: ['subscribe'] }
      : { 'delivery:*': ['subscribe'], orders: ['subscribe'] };
    const tokenRequest = await createTokenRequest({
      clientId: String(req.user.id),
      capability,
    });
    res.json(tokenRequest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
