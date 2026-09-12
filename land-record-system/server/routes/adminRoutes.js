import { Router } from 'express';
import { listUsers, updateUser, createUser, listAuditLogs } from '../controllers/adminController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = Router();
router.use(protect, authorize('admin'));

router.get('/users', listUsers);
router.post('/users', createUser);
router.put('/users/:id', updateUser);
router.get('/audit-logs', listAuditLogs);

export default router;
