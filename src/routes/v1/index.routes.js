import Router from 'express';
import authRoute from '#modules/auth/auth.routes.js';

const router = Router();
router.use('/auth', authRoute);

export default router;
