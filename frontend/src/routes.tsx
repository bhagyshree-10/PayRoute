import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth.js';
import { Layout } from './components/Layout.js';
import { LoginPage } from './pages/LoginPage.js';
import { OverviewPage } from './pages/OverviewPage.js';
import { TransactionsPage } from './pages/TransactionsPage.js';
import { TransactionDetailsPage } from './pages/TransactionDetailsPage.js';
import { GatewaysPage } from './pages/GatewaysPage.js';
import { WebhooksPage } from './pages/WebhooksPage.js';
import { RetryJobsPage } from './pages/RetryJobsPage.js';
import { SystemHealthPage } from './pages/SystemHealthPage.js';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout>
              <OverviewPage />
            </Layout>
          </RequireAuth>
        }
      />

      <Route
        path="/transactions"
        element={
          <RequireAuth>
            <Layout>
              <TransactionsPage />
            </Layout>
          </RequireAuth>
        }
      />

      <Route
        path="/transactions/:id"
        element={
          <RequireAuth>
            <Layout>
              <TransactionDetailsPage />
            </Layout>
          </RequireAuth>
        }
      />

      <Route
        path="/gateways"
        element={
          <RequireAuth>
            <Layout>
              <GatewaysPage />
            </Layout>
          </RequireAuth>
        }
      />

      <Route
        path="/webhooks"
        element={
          <RequireAuth>
            <Layout>
              <WebhooksPage />
            </Layout>
          </RequireAuth>
        }
      />

      <Route
        path="/retries"
        element={
          <RequireAuth>
            <Layout>
              <RetryJobsPage />
            </Layout>
          </RequireAuth>
        }
      />

      <Route
        path="/health"
        element={
          <RequireAuth>
            <Layout>
              <SystemHealthPage />
            </Layout>
          </RequireAuth>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
