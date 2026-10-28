import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { ValidationError } from '../../middleware/errorHandler.js';
import { WebhookIntake } from './intake.js';

export const webhookRoutes = Router();

webhookRoutes.post(
  '/stripe',
  asyncHandler(async (req: Request, res: Response) => {
    const rawBody = req.rawBody || req.body;
    if (!Buffer.isBuffer(rawBody)) {
      throw new ValidationError('Webhook request body must be raw bytes Buffer');
    }

    const headersObj: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      headersObj[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
    }

    const result = await WebhookIntake.handle('stripe', rawBody, headersObj, req.requestId);
    return res.status(200).json(result);
  })
);

webhookRoutes.post(
  '/razorpay',
  asyncHandler(async (req: Request, res: Response) => {
    const rawBody = req.rawBody || req.body;
    if (!Buffer.isBuffer(rawBody)) {
      throw new ValidationError('Webhook request body must be raw bytes Buffer');
    }

    const headersObj: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      headersObj[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
    }

    const result = await WebhookIntake.handle('razorpay', rawBody, headersObj, req.requestId);
    return res.status(200).json(result);
  })
);
