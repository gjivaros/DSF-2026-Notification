import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { hashPassword, sha256 } from '../src/common/crypto';

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
    const existing = await prisma.application.findUnique({ where: { code: app.code } });
    const data = {
      name: app.name,
      dailyQuota: app.dailyQuota,
      apiKeyHash: sha256(requireEnv(app.apiKeyEnv)),
      webhookUrl,
      // The webhook secret is generated once and kept on later seeds
      webhookSecret: existing?.webhookSecret ?? randomBytes(32).toString('hex'),
    };
    // Status is left untouched on existing applications; a new one starts active with its first history entry
    const saved = existing
      ? await prisma.application.update({ where: { id: existing.id }, data })
      : await prisma.application.create({
          data: {
            ...data,
            code: app.code,
            statusHistory: { create: { status: 'active', reason: 'Initial status' } },
          },
        });
    console.log(`Seeded ${saved.code} (quota ${saved.dailyQuota}) webhookSecret=${saved.webhookSecret}`);
  }

  // Root admin of the dashboard: the password is only set at creation
  const email = requireEnv('ROOT_ADMIN_EMAIL').toLowerCase();
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash: hashPassword(requireEnv('ROOT_ADMIN_PASSWORD')), role: 'ROOT' },
  });
  console.log(`Seeded root admin ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
