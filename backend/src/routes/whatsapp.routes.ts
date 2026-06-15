import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import {
    getNumberRequests,
    createNumberRequest,
    getAccounts,
    addMetaAccount,
    deleteAccount,
    getAccountDiagnostics,
    getBusinessProfile,
    updateBusinessProfile,
    getTemplates,
    validateTemplate,
    createTemplate,
    deleteTemplate
} from '../controllers/whatsapp.controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Base path: /api/whatsapp

router.get('/number-requests', authMiddleware, getNumberRequests);
router.post('/number-requests', authMiddleware, createNumberRequest);

router.get('/accounts', authMiddleware, getAccounts);
router.post('/accounts/meta', authMiddleware, addMetaAccount);
router.delete('/accounts/:id', authMiddleware, deleteAccount);
router.get('/accounts/:id/diagnostics', authMiddleware, getAccountDiagnostics);
router.get('/accounts/:id/business-profile', authMiddleware, getBusinessProfile);
router.patch('/accounts/:id/business-profile', authMiddleware, upload.single('profile_picture'), updateBusinessProfile);

router.get('/templates', authMiddleware, getTemplates);
router.post('/templates/validate', authMiddleware, validateTemplate);
router.post('/templates', authMiddleware, upload.single('file'), createTemplate);
router.delete('/templates/:name', authMiddleware, deleteTemplate);

export default router;
