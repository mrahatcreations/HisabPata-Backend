const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error('Usage: node seed-admin.js <email> <password>');
    process.exit(1);
  }

  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin with email ${email} already exists.`);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  await prisma.admin.create({
    data: {
      name: 'Super Admin',
      email,
      password: hashedPassword,
      role: 'superadmin',
    },
  });

  console.log(`Successfully created admin account for ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
