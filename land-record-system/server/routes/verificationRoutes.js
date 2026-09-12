import { Router } from 'express';
import { reviewDocument, getQueue } from '../controllers/verificationController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/queue', getQueue);
router.put('/:id', reviewDocument);

export default router;
