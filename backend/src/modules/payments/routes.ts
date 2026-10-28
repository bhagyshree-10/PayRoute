import { Router, Request, Response } from 'express';
import { PaymentCreateSchema } from '@payroute/shared';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { ValidationError, AppError } from '../../middleware/errorHandler.js';
import { requireClientOrAdmin } from '../auth/middleware.js';
import { PaymentService } from './service.js';

export const paymentRoutes = Router();

// 1. POST /api/payments (Create payment)
paymentRoutes.post(
  '/',
  requireClientOrAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey || !/^[A-Za-z0-9_.:-]{8,128}$/.test(idempotencyKey)) {
      throw new AppError(
        'IDEMPOTENCY_KEY_REQUIRED',
        'validation',
        'Header Idempotency-Key is required (format: 8 to 128 chars [A-Za-z0-9_.:-])',
        400,
        false
      );
    }

    const parseRes = PaymentCreateSchema.safeParse(req.body);
    if (!parseRes.success) {
      throw new ValidationError('Invalid payment creation request body', parseRes.error.errors);
    }

    const clientId = req.clientId || 'usr_01H8X700000000000000000001';
    const { response, isReplay } = await PaymentService.create(
      clientId,
      parseRes.data,
      idempotencyKey,
      req.requestId
    );

    if (isReplay) {
      res.setHeader('Idempotent-Replayed', 'true');
    }

    return res.status(response.status).json(response.body);
  })
);

// 2. GET /api/payments/:id (Get payment)
paymentRoutes.get(
  '/:id',
  requireClientOrAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const clientId = req.clientId;
    const isAdmin = Boolean(req.admin);

    const data = await PaymentService.get(id, clientId, isAdmin);

    return res.status(200).json({
      data,
      meta: {
        requestId: req.requestId,
      },
    });
  })
);

// 3. POST /api/payments/:id/cancel (Cancel payment)
paymentRoutes.post(
  '/:id/cancel',
  requireClientOrAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const clientId = req.clientId;
    const isAdmin = Boolean(req.admin);

    const cancelledTxn = await PaymentService.cancel(id, clientId, isAdmin);

    return res.status(200).json({
      data: {
        id: cancelledTxn.id,
        status: cancelledTxn.status,
        updatedAt: cancelledTxn.updatedAt,
      },
      meta: {
        requestId: req.requestId,
      },
    });
  })
);
