import { Router } from 'express';
import { jwtCheck, loadUser } from '../middleware/auth.js';

const router = Router();

// GET /api/auth/me — returns the current user's profile + role
router.get('/me', jwtCheck, loadUser, (req, res) => {
  res.json(req.user);
});

export default router;
