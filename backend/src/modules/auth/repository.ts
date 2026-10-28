import { collections } from '../../infra/mongo.js';
import { UserDoc } from '../types.js';

export const UserRepository = {
  async findByEmail(email: string): Promise<UserDoc | null> {
    return collections.users().findOne({ email: email.toLowerCase() });
  },

  async findByApiKeyHash(keyHash: string): Promise<UserDoc | null> {
    return collections.users().findOne({ apiKeyHash: keyHash });
  },

  async findById(id: string): Promise<UserDoc | null> {
    return collections.users().findOne({ _id: id });
  },

  async upsertUser(user: UserDoc): Promise<UserDoc> {
    await collections.users().updateOne(
      { _id: user._id },
      { $set: user },
      { upsert: true }
    );
    return user;
  }
};
