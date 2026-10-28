import express from 'express';

export const rawBodyMiddleware = express.raw({
  type: '*/*',
  limit: '1mb',
  verify: (req, _res, buf) => {
    (req as any).rawBody = buf;
  }
});
