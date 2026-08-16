import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@avf.local' },
    update: {},
    create: {
      email: 'admin@avf.local',
      passwordHash,
      name: 'Admin',
      role: 'ADMIN',
    },
  });

  const project = await prisma.project.create({
    data: {
      userId: admin.id,
      name: 'AI News Daily',
      description: 'Daily AI news reels project',
      language: 'vi-VN',
      category: 'Technology',
      defaultTemplate: 'NEWS',
      defaultDurationSeconds: 60,
      publishingMode: 'MANUAL',
      topics: {
        create: [
          {
            name: 'AI News',
            description: 'Latest news about AI',
            keywords: ['AI', 'Gemini', 'OpenAI', 'Robotics', 'Automation'],
            language: 'vi-VN',
            frequencyPerDay: 3,
          },
          {
            name: 'Tech Tips',
            description: 'Useful tech tips for daily life',
            keywords: ['tip', 'trick', 'productivity', 'tools'],
            language: 'vi-VN',
            frequencyPerDay: 1,
          },
        ],
      },
      schedules: {
        create: [
          {
            name: 'Morning & Evening',
            times: ['08:00', '20:00'],
            days: ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
            status: 'ACTIVE',
          },
        ],
      },
    },
    include: { topics: true, schedules: true },
  });

  await prisma.aIProvider.createMany({
    data: [
      {
        type: 'AI',
        name: 'Gemini Flash',
        provider: 'GEMINI',
        model: 'gemini-2.0-flash',
        isDefault: true,
      },
      {
        type: 'AI',
        name: 'OpenAI GPT-4o mini',
        provider: 'OPENAI',
        model: 'gpt-4o-mini',
      },
      {
        type: 'IMAGE',
        name: 'OpenAI Image',
        provider: 'OPENAI',
        model: 'gpt-image-1',
        isDefault: true,
      },
      {
        type: 'VOICE',
        name: 'OpenAI TTS',
        provider: 'OPENAI',
        model: 'gpt-4o-mini-tts',
        isDefault: true,
      },
    ],
  });

  await prisma.systemSetting.upsert({
    where: { key: 'platform.requireQualityCheck' },
    update: {},
    create: {
      key: 'platform.requireQualityCheck',
      value: Prisma.JsonNull,
      description: 'Whether automatic publishing must pass QA',
    },
  });

  console.log('Seed complete.');
  console.log('  Admin email: admin@avf.local');
  console.log('  Admin password: Password123!');
  console.log(`  Project: ${project.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
