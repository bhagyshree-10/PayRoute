import { Router, Request, Response } from 'express';
import { env } from '../../config/env.js';
import { SimulationUpdateSchema } from '@payroute/shared';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { NotFoundError, ValidationError } from '../../middleware/errorHandler.js';
import { requireAdmin } from '../auth/middleware.js';
import { collections } from '../../infra/mongo.js';
import { logger } from '../../infra/logger.js';

export const simulationRoutes = Router();

simulationRoutes.use(requireAdmin);

simulationRoutes.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    if (!env.ENABLE_FAILURE_INJECTION || env.NODE_ENV === 'production') {
      throw new NotFoundError('SIMULATION_DISABLED', 'Failure injection simulation is disabled in this environment');
    }

    const gateways = await collections.gatewayHealth().find().toArray();
    const result = gateways.map((g: any) => ({
      gateway: g._id,
      simulation: g.simulation || { mode: 'NONE', expiresAt: null },
    }));

    return res.status(200).json({
      data: result,
      meta: { requestId: req.requestId },
    });
  })
);

simulationRoutes.put(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    if (!env.ENABLE_FAILURE_INJECTION || env.NODE_ENV === 'production') {
      throw new NotFoundError('SIMULATION_DISABLED', 'Failure injection simulation is disabled in this environment');
    }

    const parseRes = SimulationUpdateSchema.safeParse(req.body);
    if (!parseRes.success) {
      throw new ValidationError('Invalid simulation update body', parseRes.error.errors);
    }

    const { gateway, mode, durationSeconds } = parseRes.data;
    const now = new Date();
    const expiresAt = mode === 'NONE' ? null : new Date(now.getTime() + durationSeconds * 1000);

    await collections.gatewayHealth().updateOne(
      { _id: gateway as any },
      {
        $set: {
          simulation: { mode, expiresAt },
          updatedAt: now,
        },
      }
    );

    logger.warn(
      { adminId: req.admin?.sub, gateway, mode, durationSeconds, event: 'simulation.changed' },
      'Admin updated failure injection simulation mode'
    );

    return res.status(200).json({
      data: {
        gateway,
        mode,
        expiresAt,
      },
      meta: { requestId: req.requestId },
    });
  })
);
