import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { NotFoundError, ValidationError, ConflictError } from '../../middleware/errorHandler.js';
import { requireAdmin } from '../auth/middleware.js';
import { AdminQueryService } from './queryService.js';
import { collections } from '../../infra/mongo.js';
import { CircuitBreaker } from '../circuit-breaker/circuitBreaker.js';
import { WebhookEventRepository } from '../webhooks/repository.js';
import { enqueueWebhookProcessJob } from '../../infra/queues.js';
import { GatewayPatchSchema } from '@payroute/shared';
import { PaymentAttemptRepository } from '../attempts/repository.js';
import { RetryJobsRepository } from '../retry/retryJobs.repository.js';
import { TransactionRepository } from '../payments/repository.js';
import { logger } from '../../infra/logger.js';

export const adminRoutes = Router();

adminRoutes.use(requireAdmin);

// 1. GET /api/admin/overview
adminRoutes.get(
  '/overview',
  asyncHandler(async (req: Request, res: Response) => {
    const range = (req.query.range as string) || '24h';
    if (!['1h', '24h', '7d'].includes(range)) {
      throw new ValidationError('Invalid range query parameter. Must be 1h, 24h, or 7d');
    }

    const data = await AdminQueryService.getOverview(range);
    return res.status(200).json({
      data,
      meta: { requestId: req.requestId }
    });
  })
);

// 2. GET /api/admin/transactions
adminRoutes.get(
  '/transactions',
  asyncHandler(async (req: Request, res: Response) => {
    const { status, gateway, q, limit: limitStr, cursor } = req.query;
    const limit = Math.min(parseInt((limitStr as string) || '25', 10), 100);

    const filter: any = {};
    if (status) filter.status = status;
    if (gateway) filter.finalGateway = gateway;

    if (q) {
      const qStr = (q as string).trim();
      filter.$or = [
        { id: qStr },
        { id: { $regex: `^${qStr}`, $options: 'i' } },
        { _id: qStr },
        { _id: { $regex: `^${qStr}`, $options: 'i' } },
        { 'customer.reference': qStr },
        { gatewayReference: qStr }
      ];
    }

    if (cursor) {
      filter._id = { ...(filter._id || {}), $lt: cursor };
    }

    const items = await collections
      .transactions()
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray();

    const nextCursor = items.length === limit ? items[items.length - 1]._id : null;

    return res.status(200).json({
      data: items,
      meta: {
        requestId: req.requestId,
        limit,
        nextCursor
      }
    });
  })
);

// 3. GET /api/admin/transactions/:id
adminRoutes.get(
  '/transactions/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const txn = await TransactionRepository.findById(id);
    if (!txn) {
      throw new NotFoundError('PAYMENT_NOT_FOUND', `Transaction ${id} not found`);
    }

    const attempts = await PaymentAttemptRepository.findByTransactionId(id);
    const webhookEvents = await collections.webhookEvents().find({ transactionId: id }).toArray();
    const retryJobs = await RetryJobsRepository.findByTransactionId(id);

    return res.status(200).json({
      data: {
        transaction: txn,
        attempts,
        webhookEvents,
        retryJobs
      },
      meta: { requestId: req.requestId }
    });
  })
);

// 4. GET /api/admin/gateways
adminRoutes.get(
  '/gateways',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await AdminQueryService.getGateways();
    return res.status(200).json({
      data,
      meta: { requestId: req.requestId }
    });
  })
);

// 5. PATCH /api/admin/gateways/:name
adminRoutes.patch(
  '/gateways/:name',
  asyncHandler(async (req: Request, res: Response) => {
    const { name } = req.params;
    if (name !== 'stripe' && name !== 'razorpay') {
      throw new NotFoundError('GATEWAY_NOT_FOUND', `Gateway ${name} not found`);
    }

    const parseRes = GatewayPatchSchema.safeParse(req.body);
    if (!parseRes.success) {
      throw new ValidationError('Invalid gateway patch payload', parseRes.error.errors);
    }

    const { enabled } = parseRes.data;
    await collections.gatewayHealth().updateOne(
      { _id: name as any },
      { $set: { enabled, updatedAt: new Date() } }
    );

    logger.warn({ adminId: req.admin?.sub, gateway: name, enabled, event: 'admin.action' }, 'Admin toggled gateway state');

    return res.status(200).json({
      data: { name, enabled },
      meta: { requestId: req.requestId }
    });
  })
);

// 6. POST /api/admin/gateways/:name/circuit/reset
adminRoutes.post(
  '/gateways/:name/circuit/reset',
  asyncHandler(async (req: Request, res: Response) => {
    const { name } = req.params;
    if (name !== 'stripe' && name !== 'razorpay') {
      throw new NotFoundError('GATEWAY_NOT_FOUND', `Gateway ${name} not found`);
    }

    await CircuitBreaker.resetCircuit(name as any);
    logger.warn({ adminId: req.admin?.sub, gateway: name, event: 'admin.action' }, 'Admin reset gateway circuit breaker');

    return res.status(200).json({
      data: { name, circuitState: 'CLOSED' },
      meta: { requestId: req.requestId }
    });
  })
);

// 7. GET /api/admin/webhooks
adminRoutes.get(
  '/webhooks',
  asyncHandler(async (req: Request, res: Response) => {
    const { status, gateway, limit: limitStr, cursor } = req.query;
    const limit = Math.min(parseInt((limitStr as string) || '25', 10), 100);

    const filter: any = {};
    if (status) filter.status = status;
    if (gateway) filter.gateway = gateway;

    if (cursor) {
      filter._id = { $lt: cursor };
    }

    const items = await collections
      .webhookEvents()
      .find(filter)
      .sort({ receivedAt: -1, _id: -1 })
      .limit(limit)
      .toArray();

    const nextCursor = items.length === limit ? items[items.length - 1]._id : null;

    return res.status(200).json({
      data: items,
      meta: { requestId: req.requestId, limit, nextCursor }
    });
  })
);

// 8. GET /api/admin/webhooks/:id
adminRoutes.get(
  '/webhooks/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const event = await WebhookEventRepository.findById(id);
    if (!event) {
      throw new NotFoundError('WEBHOOK_NOT_FOUND', `Webhook event ${id} not found`);
    }

    return res.status(200).json({
      data: event,
      meta: { requestId: req.requestId }
    });
  })
);

// 9. POST /api/admin/webhooks/:id/reprocess
adminRoutes.post(
  '/webhooks/:id/reprocess',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const event = await WebhookEventRepository.findById(id);
    if (!event) {
      throw new NotFoundError('WEBHOOK_NOT_FOUND', `Webhook event ${id} not found`);
    }

    if (event.status !== 'FAILED' && event.status !== 'ORPHANED') {
      throw new ConflictError(
        'INVALID_STATE_TRANSITION',
        `Only FAILED or ORPHANED webhooks can be reprocessed (current status: ${event.status})`
      );
    }

    await WebhookEventRepository.update(id, {
      status: 'RECEIVED',
      processingAttempts: 0,
      lastError: null
    });

    await enqueueWebhookProcessJob({ webhookEventId: id }, { jobId: id });
    logger.warn({ adminId: req.admin?.sub, webhookId: id, event: 'admin.action' }, 'Admin requested webhook reprocessing');

    return res.status(200).json({
      data: { id, status: 'RECEIVED' },
      meta: { requestId: req.requestId }
    });
  })
);

// 10. GET /api/admin/retries
adminRoutes.get(
  '/retries',
  asyncHandler(async (req: Request, res: Response) => {
    const { status, type, transactionId, limit: limitStr, cursor } = req.query;
    const limit = Math.min(parseInt((limitStr as string) || '25', 10), 100);

    const filter: any = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (transactionId) filter.transactionId = transactionId;

    if (cursor) {
      filter._id = { $lt: cursor };
    }

    const items = await collections
      .retryJobs()
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray();

    const nextCursor = items.length === limit ? items[items.length - 1]._id : null;

    return res.status(200).json({
      data: items,
      meta: { requestId: req.requestId, limit, nextCursor }
    });
  })
);

// 11. GET /api/admin/health
adminRoutes.get(
  '/health',
  asyncHandler(async (req: Request, res: Response) => {
    const data = await AdminQueryService.getSystemHealth();
    return res.status(200).json({
      data,
      meta: { requestId: req.requestId }
    });
  })
);
