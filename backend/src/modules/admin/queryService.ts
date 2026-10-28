import { collections } from '../../infra/mongo.js';
import { env } from '../../config/env.js';
import { HealthService } from '../health/healthService.js';
import { CircuitBreaker } from '../circuit-breaker/circuitBreaker.js';
import { getRedisClient, checkRedisHealth } from '../../infra/redis.js';
import { getPaymentsQueue, getWebhooksQueue } from '../../infra/queues.js';
import {
  GatewayAdminCardData,
  GatewayName,
  OverviewData,
  SeriesBucket,
  SystemHealthData
} from '@payroute/shared';

export class AdminQueryServiceClass {
  async getOverview(range: string = '24h'): Promise<OverviewData> {
    const now = new Date();
    let windowMs = 24 * 3600 * 1000;
    if (range === '1h') windowMs = 3600 * 1000;
    if (range === '7d') windowMs = 7 * 24 * 3600 * 1000;

    const rangeStart = new Date(now.getTime() - windowMs);

    // 1. Transactions in range
    const txns = await collections
      .transactions()
      .find({ createdAt: { $gte: rangeStart } })
      .toArray();

    const totalTxns = txns.length;
    const successes = txns.filter((t: any) => t.status === 'SUCCESS').length;
    const failures = txns.filter((t: any) => t.status === 'FAILED').length;

    const completed = successes + failures;
    const successRate = completed > 0 ? successes / completed : 0;

    const statusCounts: Record<string, number> = {
      CREATED: 0,
      PROCESSING: 0,
      RETRYING: 0,
      AWAITING_CONFIRMATION: 0,
      SUCCESS: 0,
      FAILED: 0,
      CANCELLED: 0,
    };

    txns.forEach((t: any) => {
      statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
    });

    let fallbacks = 0;
    let suspectedDuplicateCharges = 0;

    txns.forEach((t: any) => {
      if (t.routing?.exhaustedGateways && t.routing.exhaustedGateways.length > 0) {
        fallbacks++;
      }
      if (t.flags?.includes('DUPLICATE_CHARGE_SUSPECTED')) {
        suspectedDuplicateCharges++;
      }
    });

    // 2. Attempts & latencies in range
    const attempts = await collections
      .paymentAttempts()
      .find({ createdAt: { $gte: rangeStart } })
      .toArray();

    const latencies = attempts
      .map((a: any) => a.latencyMs)
      .filter((l: any): l is number => typeof l === 'number');

    const avgLatencyMs =
      latencies.length > 0
        ? Math.round(latencies.reduce((sum: number, v: number) => sum + v, 0) / latencies.length)
        : 0;

    // 3. Webhooks & Retries counts
    const webhooks = await collections
      .webhookEvents()
      .find({ receivedAt: { $gte: rangeStart } })
      .toArray();

    let duplicateWebhooksIgnored = 0;
    let failedWebhooks = 0;

    webhooks.forEach((w: any) => {
      duplicateWebhooksIgnored += w.duplicateCount || 0;
      if (w.status === 'FAILED') failedWebhooks++;
    });

    const retriesScheduled = await collections
      .retryJobs()
      .countDocuments({ createdAt: { $gte: rangeStart } });

    // 4. Time series buckets
    const bucketCount = range === '1h' ? 12 : range === '24h' ? 24 : 28;
    const bucketSizeMs = windowMs / bucketCount;

    const series: SeriesBucket[] = [];
    for (let i = 0; i < bucketCount; i++) {
      const bStart = new Date(rangeStart.getTime() + i * bucketSizeMs);
      const bEnd = new Date(rangeStart.getTime() + (i + 1) * bucketSizeMs);

      const bAttempts = attempts.filter(
        (a: any) =>
          new Date(a.createdAt).getTime() >= bStart.getTime() &&
          new Date(a.createdAt).getTime() < bEnd.getTime()
      );

      const stripeOk = bAttempts.filter(
        (a: any) => a.gateway === 'stripe' && (a.status === 'SUCCEEDED' || a.status === 'ACCEPTED')
      ).length;
      const stripeFault = bAttempts.filter(
        (a: any) => a.gateway === 'stripe' && a.status === 'FAILED'
      ).length;

      const rzpOk = bAttempts.filter(
        (a: any) => a.gateway === 'razorpay' && (a.status === 'SUCCEEDED' || a.status === 'ACCEPTED')
      ).length;
      const rzpFault = bAttempts.filter(
        (a: any) => a.gateway === 'razorpay' && a.status === 'FAILED'
      ).length;

      const timeLabel = bStart.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      series.push({
        t: timeLabel,
        stripe: { ok: stripeOk, fault: stripeFault },
        razorpay: { ok: rzpOk, fault: rzpFault }
      });
    }

    // 5. Gateways summary
    const gatewayCards = await this.getGateways();
    const gatewaysSummary = gatewayCards.map((g) => ({
      name: g.name,
      status: g.status,
      circuitState: g.circuitState,
      successRate5m: g.window5m.successRate
    }));

    // 6. BullMQ Queue depths
    let queues = {
      payments: { waiting: 0, active: 0, delayed: 0, failed: 0 },
      webhooks: { waiting: 0, active: 0, delayed: 0, failed: 0 }
    };

    const redisCheck = await checkRedisHealth(500);
    if (redisCheck.status === 'OK') {
      try {
        const pQueue = getPaymentsQueue();
        const wQueue = getWebhooksQueue();

        const pCounts = await pQueue.getJobCounts('waiting', 'active', 'delayed', 'failed');
        const wCounts = await wQueue.getJobCounts('waiting', 'active', 'delayed', 'failed');

        queues = {
          payments: {
            waiting: pCounts.waiting || 0,
            active: pCounts.active || 0,
            delayed: pCounts.delayed || 0,
            failed: pCounts.failed || 0
          },
          webhooks: {
            waiting: wCounts.waiting || 0,
            active: wCounts.active || 0,
            delayed: wCounts.delayed || 0,
            failed: wCounts.failed || 0
          }
        };
      } catch {}
    }

    // 7. Newest 5 FAILED transactions
    const recentFailures = txns
      .filter((t: any) => t.status === 'FAILED')
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map((t: any) => ({
        id: t.id,
        code: t.failure?.code || 'FAILED',
        gateway: t.failure?.gateway || t.finalGateway || null,
        at: new Date(t.createdAt).toISOString()
      }));

    return {
      kpis: {
        transactions: totalTxns,
        successRate,
        avgLatencyMs,
        retriesScheduled,
        fallbacks,
        duplicateWebhooksIgnored,
        failedWebhooks,
        suspectedDuplicateCharges
      },
      statusCounts: statusCounts as any,
      series,
      gateways: gatewaysSummary,
      queues,
      recentFailures
    };
  }

  async getGateways(): Promise<GatewayAdminCardData[]> {
    const results: GatewayAdminCardData[] = [];
    const now = Date.now();

    for (const gwName of ['stripe', 'razorpay'] as const) {
      const gwDoc = await collections.gatewayHealth().findOne({ _id: gwName as any });
      const windowStats = await HealthService.getWindowStats(gwName);
      const peekState = await CircuitBreaker.peek(gwName);
      const status = HealthService.deriveStatusFromStats(peekState.state, windowStats, peekState.canProbe);

      // 60-minute activity buckets
      const sixtyMinAgo = new Date(now - 60 * 60 * 1000);
      const atts60m = await collections
        .paymentAttempts()
        .find({ gateway: gwName, startedAt: { $gte: sixtyMinAgo } })
        .toArray();

      const activity60m = Array.from({ length: 60 }, (_, i) => {
        const bStart = new Date(sixtyMinAgo.getTime() + i * 60000);
        const bEnd = new Date(sixtyMinAgo.getTime() + (i + 1) * 60000);

        const inBucket = atts60m.filter(
          (a: any) =>
            new Date(a.startedAt).getTime() >= bStart.getTime() &&
            new Date(a.startedAt).getTime() < bEnd.getTime()
        );

        const ok = inBucket.filter((a: any) => a.status === 'SUCCEEDED' || a.status === 'ACCEPTED').length;
        const fault = inBucket.filter((a: any) => a.status === 'FAILED').length;

        return { t: `${i}m`, ok, fault };
      });

      results.push({
        name: gwName,
        enabled: gwDoc?.enabled ?? true,
        status,
        circuitState: gwDoc?.state || 'CLOSED',
        consecutiveFailures: gwDoc?.consecutiveFailures || 0,
        successCount: gwDoc?.successCount || 0,
        failureCount: gwDoc?.failureCount || 0,
        window5m: {
          total: windowStats.total,
          successRate: windowStats.successRate,
          avgLatencyMs: windowStats.avgLatencyMs,
          p95LatencyMs: windowStats.p95LatencyMs
        },
        lastSuccessAt: gwDoc?.lastSuccessAt ? new Date(gwDoc.lastSuccessAt).toISOString() : null,
        lastFailureAt: gwDoc?.lastFailureAt ? new Date(gwDoc.lastFailureAt).toISOString() : null,
        lastFailureReason: gwDoc?.lastFailureReason || null,
        nextProbeAt: gwDoc?.nextProbeAt ? new Date(gwDoc.nextProbeAt).toISOString() : null,
        recentTransitions: gwDoc?.recentTransitions || [],
        activity60m
      });
    }

    return results;
  }

  async getSystemHealth(): Promise<SystemHealthData> {
    const now = new Date();
    let mongoPing = 0;
    let mongoStatus: 'OK' | 'DOWN' = 'OK';

    try {
      const t0 = Date.now();
      await collections.users().findOne({});
      mongoPing = Date.now() - t0;
    } catch {
      mongoStatus = 'DOWN';
    }

    let redisPing = 0;
    let redisStatus: 'OK' | 'DOWN' = 'OK';
    let workerHeartbeat: string | null = null;
    let sweeperLast: any = null;

    const redisHealth = await checkRedisHealth(1000);
    redisStatus = redisHealth.status;
    redisPing = redisHealth.pingMs;

    if (redisStatus === 'OK') {
      try {
        const redis = getRedisClient();
        workerHeartbeat = await redis.get('payroute:worker:heartbeat');
        const rawSweeper = await redis.get('payroute:sweeper:last');
        if (rawSweeper) {
          sweeperLast = JSON.parse(rawSweeper);
        }
      } catch {}
    }

    let workerStatus: 'OK' | 'DOWN' = 'DOWN';
    if (workerHeartbeat) {
      const heartbeatAge = (now.getTime() - new Date(workerHeartbeat).getTime()) / 1000;
      if (heartbeatAge <= 15) {
        workerStatus = 'OK';
      }
    }

    const gateways = await this.getGateways();

    let queues = {
      payments: { waiting: 0, active: 0, delayed: 0, failed: 0 },
      webhooks: { waiting: 0, active: 0, delayed: 0, failed: 0 }
    };

    if (redisStatus === 'OK') {
      try {
        const pQueue = getPaymentsQueue();
        const wQueue = getWebhooksQueue();

        const pCounts = await pQueue.getJobCounts('waiting', 'active', 'delayed', 'failed');
        const wCounts = await wQueue.getJobCounts('waiting', 'active', 'delayed', 'failed');

        queues = {
          payments: {
            waiting: pCounts.waiting || 0,
            active: pCounts.active || 0,
            delayed: pCounts.delayed || 0,
            failed: pCounts.failed || 0
          },
          webhooks: {
            waiting: wCounts.waiting || 0,
            active: wCounts.active || 0,
            delayed: wCounts.delayed || 0,
            failed: wCounts.failed || 0
          }
        };
      } catch {}
    }

    const overallApiStatus = mongoStatus === 'OK' && redisStatus === 'OK' ? 'OK' : 'DEGRADED';

    return {
      api: {
        status: overallApiStatus,
        uptimeSeconds: Math.floor(process.uptime()),
        version: '1.0.0',
        nodeVersion: process.version
      },
      mongo: {
        status: mongoStatus,
        pingMs: mongoPing
      },
      redis: {
        status: redisStatus,
        pingMs: redisPing
      },
      worker: {
        status: workerStatus,
        lastHeartbeatAt: workerHeartbeat
      },
      queues,
      sweeper: {
        lastRunAt: sweeperLast?.lastRunAt || null,
        lastRunDurationMs: sweeperLast?.durationMs || null,
        repairsLastRun: sweeperLast?.repairs || null
      },
      gateways: gateways.map((g) => ({
        name: g.name,
        status: g.status,
        circuitState: g.circuitState
      }))
    };
  }
}

export const AdminQueryService = new AdminQueryServiceClass();
