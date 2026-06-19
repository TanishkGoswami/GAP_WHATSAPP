import { Router } from 'express';
import { 
    getContacts, 
    createContact, 
    updateContact, 
    getContactProfilePhoto,
    saveContact, 
    deleteContact 
} from '../controllers/contacts.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

// Base path will be: /api/contacts

router.get('/', authMiddleware, getContacts);
router.post('/', authMiddleware, createContact);
router.get('/:id/profile-photo', authMiddleware, getContactProfilePhoto);
router.patch('/:id', authMiddleware, updateContact);
router.post('/:id/save', authMiddleware, saveContact);
router.delete('/:id', authMiddleware, deleteContact);

export default router;
