import { Router } from 'express';
import {
  register,
  login,
  me,
  updateMe,
  changeMyPassword,
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.post('/register', protect, register);
router.post('/login', login);
router.get('/me', protect, me);
router.put('/me', protect, updateMe);
router.put('/me/password', protect, changeMyPassword);

export default router;
