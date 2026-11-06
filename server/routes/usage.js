import { Router } from 'express';
import { getUsage } from '../controllers/usageController.js';
import { requireDatabase } from '../middlewares/requireDatabase.js';

const router = Router();
router.use(requireDatabase);
router.get('/', getUsage);

export default router;
