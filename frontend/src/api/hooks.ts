import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  GatewayAdminCardData,
  GatewayName,
  OverviewData,
  PaymentAttempt,
  RetryJobRecord,
  SimulationMode,
  SystemHealthData,
  Transaction,
  WebhookEvent
} from '@payroute/shared';
import { apiClient } from './client.js';
import {
  mockGateways,
  mockOverviewData,
  mockRetryJobs,
  mockSystemHealth,
  mockTransactions,
  mockWebhooks
} from './mocks/fixtures.js';

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

export function useOverview(range: string = '24h') {
  return useQuery<OverviewData>({
    queryKey: ['overview', range],
    queryFn: async () => {
      if (USE_MOCKS) return mockOverviewData;
      const res = await apiClient<OverviewData>(`/admin/overview?range=${range}`);
      return res.data;
    },
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
}

export function useTransactions(params: Record<string, string> = {}) {
  const queryStr = new URLSearchParams(params).toString();
  return useQuery<{ items: Transaction[]; nextCursor?: string | null }>({
    queryKey: ['transactions', queryStr],
    queryFn: async () => {
      if (USE_MOCKS) return { items: mockTransactions, nextCursor: null };
      const res = await apiClient<Transaction[]>(`/admin/transactions?${queryStr}`);
      return { items: res.data, nextCursor: res.meta?.nextCursor };
    },
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });
}

export function useTransaction(id: string) {
  return useQuery<{
    transaction: Transaction;
    attempts: PaymentAttempt[];
    webhookEvents: WebhookEvent[];
    retryJobs: RetryJobRecord[];
  }>({
    queryKey: ['transaction', id],
    queryFn: async () => {
      if (USE_MOCKS) {
        const txn = mockTransactions.find((t) => t.id === id) || mockTransactions[0];
        return {
          transaction: txn,
          attempts: mockTransactions.filter((a) => a.id === id) as any,
          webhookEvents: mockWebhooks.filter((w) => w.transactionId === id),
          retryJobs: mockRetryJobs.filter((r) => r.transactionId === id),
        };
      }
      const res = await apiClient<any>(`/admin/transactions/${id}`);
      return res.data;
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 3000;
      const status = data.transaction?.status;
      if (status === 'SUCCESS' || status === 'FAILED' || status === 'CANCELLED') {
        return false;
      }
      return 3000;
    },
    refetchIntervalInBackground: false,
    enabled: Boolean(id),
  });
}

export function useGateways() {
  return useQuery<GatewayAdminCardData[]>({
    queryKey: ['gateways'],
    queryFn: async () => {
      if (USE_MOCKS) return mockGateways;
      const res = await apiClient<GatewayAdminCardData[]>('/admin/gateways');
      return res.data;
    },
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
}

export function useWebhooks(params: Record<string, string> = {}) {
  const queryStr = new URLSearchParams(params).toString();
  return useQuery<{ items: WebhookEvent[]; nextCursor?: string | null }>({
    queryKey: ['webhooks', queryStr],
    queryFn: async () => {
      if (USE_MOCKS) return { items: mockWebhooks, nextCursor: null };
      const res = await apiClient<WebhookEvent[]>(`/admin/webhooks?${queryStr}`);
      return { items: res.data, nextCursor: res.meta?.nextCursor };
    },
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });
}

export function useRetryJobs(params: Record<string, string> = {}) {
  const queryStr = new URLSearchParams(params).toString();
  return useQuery<{ items: RetryJobRecord[]; nextCursor?: string | null }>({
    queryKey: ['retries', queryStr],
    queryFn: async () => {
      if (USE_MOCKS) return { items: mockRetryJobs, nextCursor: null };
      const res = await apiClient<RetryJobRecord[]>(`/admin/retries?${queryStr}`);
      return { items: res.data, nextCursor: res.meta?.nextCursor };
    },
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
}

export function useHealth() {
  return useQuery<SystemHealthData>({
    queryKey: ['health'],
    queryFn: async () => {
      if (USE_MOCKS) return mockSystemHealth;
      const res = await apiClient<SystemHealthData>('/admin/health');
      return res.data;
    },
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
}

// Mutations
export function useCreateTestPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      amount: number;
      currency: string;
      customerReference: string;
      preferredGateway?: string;
      idempotencyKey: string;
      token?: string;
    }) => {
      const res = await apiClient<Transaction>('/payments', {
        method: 'POST',
        headers: {
          'Idempotency-Key': payload.idempotencyKey,
        },
        body: JSON.stringify({
          amount: payload.amount,
          currency: payload.currency,
          customer: { reference: payload.customerReference },
          paymentMethod: { type: 'test_token', token: payload.token || 'pm_card_visa' },
          preferredGateway: payload.preferredGateway || undefined,
        }),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
    },
  });
}

export function useToggleGateway() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, enabled }: { name: GatewayName; enabled: boolean }) => {
      const res = await apiClient<{ name: GatewayName; enabled: boolean }>(`/admin/gateways/${name}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gateways'] });
    },
  });
}

export function useResetCircuit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: GatewayName) => {
      const res = await apiClient<{ name: GatewayName; circuitState: string }>(
        `/admin/gateways/${name}/circuit/reset`,
        { method: 'POST' }
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gateways'] });
    },
  });
}

export function useReprocessWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (webhookId: string) => {
      const res = await apiClient<{ id: string; status: string }>(
        `/admin/webhooks/${webhookId}/reprocess`,
        { method: 'POST' }
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
    },
  });
}

export function useUpdateSimulation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      gateway: GatewayName;
      mode: SimulationMode;
      durationSeconds: number;
    }) => {
      const res = await apiClient<{ gateway: GatewayName; mode: SimulationMode }>(
        '/admin/simulation',
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        }
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gateways'] });
    },
  });
}
