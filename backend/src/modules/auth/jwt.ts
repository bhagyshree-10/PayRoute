import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

export interface AdminJwtPayload {
  sub: string;
  role: 'admin';
  email: string;
  name: string;
}

export function signAdminToken(payload: Omit<AdminJwtPayload, 'role'>): { token: string; expiresAt: string } {
  const token = jwt.sign({ ...payload, role: 'admin' }, env.JWT_SECRET, {
    expiresIn: '8h',
  });

  const expiresAt = new Date(Date.now() + 8 * 3600 * 1000).toISOString();
  return { token, expiresAt };
}

export function verifyAdminToken(token: string): AdminJwtPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET) as AdminJwtPayload;
  if (decoded.role !== 'admin') {
    throw new Error('Invalid token role');
  }
  return decoded;
}
