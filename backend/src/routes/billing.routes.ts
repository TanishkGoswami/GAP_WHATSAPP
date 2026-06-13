import { Router } from 'express';
import { getBillingOverview } from '../controllers/billing.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

// Base path will be: /api/billing

router.get('/overview', authMiddleware, getBillingOverview);

export default router;
