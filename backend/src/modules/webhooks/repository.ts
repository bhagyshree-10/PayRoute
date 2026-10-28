import { collections } from '../../infra/mongo.js';
import { WebhookEvent } from '@payroute/shared';

export const WebhookEventRepository = {
  async insert(event: WebhookEvent): Promise<WebhookEvent> {
    await collections.webhookEvents().insertOne(event as any);
    return event;
  },

  async findById(id: string): Promise<WebhookEvent | null> {
    return collections.webhookEvents().findOne({ $or: [{ id }, { _id: id }] });
  },

  async findByEventId(gateway: string, eventId: string): Promise<WebhookEvent | null> {
    return collections.webhookEvents().findOne({ gateway: gateway as any, eventId });
  },

  async update(id: string, patch: Partial<WebhookEvent>): Promise<void> {
    await collections.webhookEvents().updateOne({ $or: [{ id }, { _id: id }] }, { $set: patch as any });
  },

  async incrementDuplicate(gateway: string, eventId: string): Promise<void> {
    await collections.webhookEvents().updateOne(
      { gateway: gateway as any, eventId },
      {
        $inc: { duplicateCount: 1 },
        $set: { lastDuplicateAt: new Date() }
      }
    );
  }
};
