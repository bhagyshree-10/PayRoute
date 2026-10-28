import { Router } from 'express';
import { authRoutes } from './modules/auth/routes.js';
import { paymentRoutes } from './modules/payments/routes.js';
import { webhookRoutes } from './modules/webhooks/routes.js';
import { adminRoutes } from './modules/admin/routes.js';
import { simulationRoutes } from './modules/simulation/routes.js';

export const routes = Router();

routes.use('/auth', authRoutes);
routes.use('/payments', paymentRoutes);
routes.use('/webhooks', webhookRoutes);
routes.use('/admin/simulation', simulationRoutes);
routes.use('/admin', adminRoutes);
