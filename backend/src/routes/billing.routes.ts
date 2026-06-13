import { Router } from 'express';
import { getBillingOverview, getWallet, getNotifications } from '../controllers/billing.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

// Base path will be: /api/billing

router.get('/overview', authMiddleware, getBillingOverview);
router.get('/wallet', authMiddleware, getWallet);
router.get('/notifications', authMiddleware, getNotifications);

export default router;
