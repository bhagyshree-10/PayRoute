import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { LoginSchema } from '@payroute/shared';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { ValidationError, AuthenticationError } from '../../middleware/errorHandler.js';
import { UserRepository } from './repository.js';
import { signAdminToken } from './jwt.js';

export const authRoutes = Router();

authRoutes.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const parseRes = LoginSchema.safeParse(req.body);
    if (!parseRes.success) {
      throw new ValidationError('Invalid login request body', parseRes.error.errors);
    }

    const { email, password } = parseRes.data;
    const user = await UserRepository.findByEmail(email);

    if (!user || user.type !== 'admin' || !user.passwordHash) {
      throw new AuthenticationError('INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new AuthenticationError('INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const { token, expiresAt } = signAdminToken({
      sub: user._id,
      email: user.email!,
      name: user.name,
    });

    return res.status(200).json({
      data: {
        token,
        expiresAt,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
        },
      },
      meta: {
        requestId: req.requestId,
      },
    });
  })
);
