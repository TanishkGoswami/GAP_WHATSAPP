import { Router } from 'express';
import { getBillingOverview, getWallet } from '../controllers/billing.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

// Base path will be: /api/billing

router.get('/overview', authMiddleware, getBillingOverview);
router.get('/wallet', authMiddleware, getWallet);

export default router;
