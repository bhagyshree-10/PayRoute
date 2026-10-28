import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTransactions } from '../api/hooks.js';
import { TransactionStatusBadge } from '../components/domain/TransactionStatusBadge.js';
import { RouteGlyph } from '../components/domain/RouteGlyph.js';
import { CreateTestPaymentDialog } from '../components/domain/CreateTestPaymentDialog.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table.js';
import { Input } from '../components/ui/Input.js';
import { Select } from '../components/ui/Select.js';
import { Button } from '../components/ui/Button.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { ErrorState } from '../components/ui/ErrorState.js';
import { CopyableId } from '../components/ui/CopyableId.js';
import { formatDate, formatMoney } from '../lib/format.js';
import { Plus, Search, Filter, CreditCard } from 'lucide-react';

export const TransactionsPage: React.FC = () => {
  const [status, setStatus] = useState('');
  const [gateway, setGateway] = useState('');
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const queryParams: Record<string, string> = {};
  if (status) queryParams.status = status;
  if (gateway) queryParams.gateway = gateway;
  if (search) queryParams.q = search;

  const { data, isLoading, isError, error, refetch } = useTransactions(queryParams);

  return (
    <div className="space-y-4">
      {/* Header & Create Test Payment CTA */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h2 className="text-lg font-bold text-primary-dark">Transactions</h2>
          <p className="text-xs text-text-secondary">
            Searchable log of payment intents and multi-gateway routing outcomes.
          </p>
        </div>

        <Button
          variant="primary"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => setIsCreateOpen(true)}
        >
          Create Test Payment
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="p-3 bg-surface border border-border rounded-md flex flex-col md:flex-row items-center gap-3">
        <div className="flex-1 w-full relative">
          <Input
            placeholder="Search by Transaction ID, Customer Ref, or Gateway Ref..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
          <Search className="w-3.5 h-3.5 text-text-muted absolute left-2.5 top-2.5" />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'SUCCESS', label: 'SUCCESS' },
              { value: 'AWAITING_CONFIRMATION', label: 'AWAITING' },
              { value: 'RETRYING', label: 'RETRYING' },
              { value: 'FAILED', label: 'FAILED' },
              { value: 'CREATED', label: 'CREATED' },
              { value: 'CANCELLED', label: 'CANCELLED' },
            ]}
          />

          <Select
            value={gateway}
            onChange={(e) => setGateway(e.target.value)}
            options={[
              { value: '', label: 'All Gateways' },
              { value: 'stripe', label: 'Stripe (STR)' },
              { value: 'razorpay', label: 'Razorpay (RZP)' },
            ]}
          />
        </div>
      </div>

      {/* Content area */}
      {isLoading ? (
        <Skeleton rows={6} />
      ) : isError ? (
        <ErrorState
          code={(error as any)?.code || 'TRANSACTIONS_LOAD_ERROR'}
          message={(error as any)?.message || 'Failed to load transactions list'}
          requestId={(error as any)?.requestId}
          onRetry={() => refetch()}
        />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No transactions found"
          description="No payment requests match the selected filters. Create a test payment to watch routing in action."
          action={
            <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setIsCreateOpen(true)}>
              Create Test Payment
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          <Table caption="Transaction Registry">
            <TableHeader>
              <TableRow>
                <TableHead>Transaction ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Route Glyph</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Customer Ref</TableHead>
                <TableHead>Created At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((txn) => (
                <TableRow key={txn.id}>
                  <TableCell>
                    <Link to={`/transactions/${txn.id}`} className="font-mono font-semibold hover:underline text-primary">
                      <CopyableId id={txn.id} />
                    </Link>
                  </TableCell>
                  <TableCell>
                    <TransactionStatusBadge status={txn.status} />
                  </TableCell>
                  <TableCell className="font-mono font-bold tabular-nums">
                    {formatMoney(txn.amount, txn.currency)}
                  </TableCell>
                  <TableCell>
                    <RouteGlyph attempts={txn.finalGateway ? [{ gateway: txn.finalGateway as any }] : []} />
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {txn.attemptCount} (retries: {txn.retryCount})
                  </TableCell>
                  <TableCell className="font-mono text-text-secondary">
                    {txn.customer?.reference || '-'}
                  </TableCell>
                  <TableCell className="text-text-secondary text-[11px]">
                    {formatDate(txn.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Admin Test Payment Dialog */}
      <CreateTestPaymentDialog isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
};
