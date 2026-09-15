import { Router } from 'express';
import { uploadDocument, listDocuments, getDocument, getFileById, deleteDocument } from '../controllers/documentController.js';
import { protect, authorize } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = Router();
router.use(protect);

// Uploaded-file streaming (GridFS). Public to logged-in users via doc.fileUrl.
// Shape matches doc.fileUrl = /api/documents/<gridFsId>/file
router.get('/:fileId/file', getFileById);

router.post(
  '/upload',
  authorize('data_entry_officer', 'digitization_operator', 'revenue_officer', 'senior_officer', 'admin'),
  upload.single('file'),
  uploadDocument
);
router.get('/', listDocuments);
router.get('/:id', getDocument);
router.delete('/:id', deleteDocument);

export default router;
