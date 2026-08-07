import express from 'express';
import {
  getPublicLayout, getPublicSection,
  adminListSections, adminGetSection, adminCreateSection, adminUpdateSection,
  adminToggleEnabled, adminReorderSections, adminDeleteSection,
  adminAttachProducts, adminDetachProduct, adminReorderProducts,
  adminAttachShops, adminDetachShop, adminAttachCategories,
  adminSearchProducts, adminSearchShops,
} from '../controllers/marketplaceBuilderController.js';
import { requireAuth, requireAdmin, requirePermission } from '../middleware/auth.js';

// Public — resolved, ordered, currently-live homepage layout. Mounted at
// /api/marketplace-layout in server.js.
export const publicRouter = express.Router();
publicRouter.get('/', getPublicLayout);
publicRouter.get('/section/:key', getPublicSection);

// Admin — the drag-and-drop CMS itself. Mounted at /api/admin/marketplace.
export const adminRouter = express.Router();
adminRouter.use(requireAuth, requireAdmin, requirePermission('marketplace'));

adminRouter.get('/sections', adminListSections);
adminRouter.post('/sections', adminCreateSection);
adminRouter.post('/sections/reorder', adminReorderSections);
adminRouter.get('/sections/:id', adminGetSection);
adminRouter.patch('/sections/:id', adminUpdateSection);
adminRouter.patch('/sections/:id/enabled', adminToggleEnabled);
adminRouter.delete('/sections/:id', adminDeleteSection);

adminRouter.post('/sections/:id/products', adminAttachProducts);
adminRouter.post('/sections/:id/products/reorder', adminReorderProducts);
adminRouter.delete('/sections/:id/products/:productId', adminDetachProduct);

adminRouter.post('/sections/:id/shops', adminAttachShops);
adminRouter.delete('/sections/:id/shops/:shopId', adminDetachShop);

adminRouter.post('/sections/:id/categories', adminAttachCategories);

adminRouter.get('/product-search', adminSearchProducts);
adminRouter.get('/shop-search', adminSearchShops);

export default adminRouter;
