import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';
import { apiClient } from '../api/client.js';
import { Input } from '../components/ui/Input.js';
import { Button } from '../components/ui/Button.js';
import { ErrorState } from '../components/ui/ErrorState.js';
import { Lock, LogIn } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('admin123456');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string; requestId?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (import.meta.env.VITE_USE_MOCKS === 'true') {
        login('mock_jwt_token_12345', {
          id: 'usr_01H8X700000000000000000000',
          name: 'Demo Admin',
          email
        });
        navigate('/');
        return;
      }

      const res = await apiClient<{ token: string; user: { id: string; name: string; email: string } }>(
        '/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        }
      );

      login(res.data.token, res.data.user);
      navigate('/');
    } catch (err: any) {
      setError({
        code: err.code || 'INVALID_CREDENTIALS',
        message: err.message || 'Invalid email or password',
        requestId: err.requestId
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-surface border border-border rounded-lg shadow-lg p-6 space-y-5">
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded bg-primary text-white font-bold text-lg mb-1">
            PR
          </div>
          <h2 className="text-xl font-bold text-primary-dark">PayRoute Operations</h2>
          <p className="text-xs text-text-secondary">
            Payment Orchestration & Webhook Reliability Dashboard
          </p>
        </div>

        {error && (
          <ErrorState
            code={error.code}
            message={error.message}
            requestId={error.requestId}
          />
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Admin Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
            required
            autoFocus
          />

          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            isLoading={isLoading}
            icon={<LogIn className="w-4 h-4" />}
          >
            Sign In to Dashboard
          </Button>
        </form>

        <div className="pt-3 border-t border-border text-center text-[11px] text-text-muted font-mono">
          <Lock className="w-3 h-3 inline mr-1" />
          Test Mode Authentication (Admin Credentials)
        </div>
      </div>
    </div>
  );
};
