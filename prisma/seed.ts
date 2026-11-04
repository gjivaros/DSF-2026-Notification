import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { sha256 } from '../src/common/crypto';

const prisma = new PrismaClient();

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
};

const applications = [
  { code: 'ETATCIVIL', name: 'Etat civil', dailyQuota: 100, apiKeyEnv: 'SEED_ETATCIVIL_API_KEY' },
  { code: 'COURRIER', name: 'Courrier', dailyQuota: 5, apiKeyEnv: 'SEED_COURRIER_API_KEY' },
];

async function main() {
  const webhookUrl = `${requireEnv('APP_URL')}/simulator/webhook-sink`;

  for (const app of applications) {
    const data = {
      name: app.name,
      dailyQuota: app.dailyQuota,
      apiKeyHash: sha256(requireEnv(app.apiKeyEnv)),
      webhookUrl,
    };
    // The webhook secret is generated once and kept on later seeds
    const saved = await prisma.application.upsert({
      where: { code: app.code },
      update: data,
      create: { ...data, code: app.code, webhookSecret: randomBytes(32).toString('hex') },
    });
    console.log(`Seeded ${saved.code} (quota ${saved.dailyQuota}) webhookSecret=${saved.webhookSecret}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
