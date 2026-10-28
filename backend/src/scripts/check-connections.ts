import { checkMongoHealth, closeMongo } from '../infra/mongo.js';
import { checkRedisHealth, closeRedisConnections } from '../infra/redis.js';
import { env } from '../config/env.js';

async function main() {
  console.log('--- Infrastructure Connection Check ---');

  console.log(`MongoDB URI Configured: ${Boolean(env.MONGODB_URI)}`);
  console.log(`MongoDB DB Configured:  ${Boolean(env.MONGODB_DB)}`);
  const mongo = await checkMongoHealth();
  console.log(`MongoDB Status: ${mongo.status} (${mongo.pingMs}ms)`);
  await closeMongo();

  console.log(`Redis URL Configured:   ${Boolean(env.REDIS_URL)}`);
  const redis = await checkRedisHealth(2500);
  console.log(`Redis Status:   ${redis.status} (${redis.pingMs}ms)`);
  await closeRedisConnections();

  console.log('---------------------------------------');
}

main().catch((err) => {
  console.error('Check failed:', err.message);
  process.exit(1);
});
