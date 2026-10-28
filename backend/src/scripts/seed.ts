import bcrypt from 'bcrypt';
import { connectMongo, ensureSchema, collections, closeMongo } from '../infra/mongo.js';
import { generateApiKey } from '../modules/auth/apiKey.js';
import { env } from '../config/env.js';
import { logger } from '../infra/logger.js';
import { UserDoc } from '../modules/types.js';

export async function seed(): Promise<{ apiKey: string }> {
  await connectMongo();
  await ensureSchema();

  logger.info('Seeding database with default admin user and demo client...');

  // 1. Seed Admin User
  const adminPasswordHash = await bcrypt.hash(env.ADMIN_SEED_PASSWORD, 12);
  const adminUser: UserDoc = {
    _id: 'usr_01H8X700000000000000000000',
    type: 'admin',
    name: 'PayRoute Admin',
    email: env.ADMIN_SEED_EMAIL.toLowerCase(),
    passwordHash: adminPasswordHash,
    status: 'active',
    createdAt: new Date(),
  };

  await collections.users().updateOne(
    { _id: adminUser._id },
    { $set: adminUser },
    { upsert: true }
  );

  // 2. Seed Client User
  const { rawKey, keyHash, keyPrefix } = generateApiKey();
  const clientUser: UserDoc = {
    _id: 'usr_01H8X700000000000000000001',
    type: 'client',
    name: 'Demo Merchant App',
    apiKeyHash: keyHash,
    apiKeyPrefix: keyPrefix,
    status: 'active',
    createdAt: new Date(),
  };

  await collections.users().updateOne(
    { _id: clientUser._id },
    { $set: clientUser },
    { upsert: true }
  );

  logger.info('Database seeded successfully.');
  console.log('\n=============================================================');
  console.log('🎉 PAYROUTE SEED COMPLETED SUCCESSFULLY');
  console.log('-------------------------------------------------------------');
  console.log(`Admin Email:       ${env.ADMIN_SEED_EMAIL}`);
  console.log(`Admin Password:    [PROTECTED - Read from ADMIN_SEED_PASSWORD in .env]`);
  console.log(`Demo Client Key:   ${keyPrefix}****************`);
  console.log('=============================================================\n');

  return { apiKey: rawKey };
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seed()
    .then(() => closeMongo())
    .catch((err) => {
      console.error('Seed error:', err);
      process.exit(1);
    });
}
