import { Router } from 'express';
import { listRecords, getRecord, getRecordMap, listRecordGeo, updateRecord } from '../controllers/landRecordController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = Router();
// Public read (citizen portal); write requires officer roles
router.get('/', listRecords);
router.get('/geo', listRecordGeo);
router.get('/:id/map', getRecordMap);
router.get('/:id', getRecord);
router.put('/:id', protect, authorize('revenue_officer', 'senior_officer', 'admin'), updateRecord);

export default router;
