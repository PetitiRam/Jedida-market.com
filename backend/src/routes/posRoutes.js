import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as pos from '../controllers/posController.js';

const router = express.Router();
router.use(requireAuth);

router.get('/setup', pos.getPosSetup);
router.post('/setup', pos.savePosSetup);

router.get('/registers', pos.listRegisters);
router.post('/registers', pos.createRegister);
router.post('/registers/:registerId/open', pos.openRegister);
router.post('/registers/:registerId/close', pos.closeRegister);

router.get('/staff', pos.listStaff);
router.post('/staff', pos.addStaff);
router.post('/staff/:staffId/deactivate', pos.deactivateStaff);

router.get('/products/search', pos.searchPosProducts);
router.get('/payment-methods', pos.listPosPaymentMethods);

router.post('/sales', pos.createSale);

router.get('/analytics/today', pos.getTodaySalesSummary);

export default router;
