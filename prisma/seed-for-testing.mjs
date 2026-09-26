// Manual test seed (not wired into `prisma db seed`). Creates or updates
// one user per role, each with a service number and bcrypt-hashed PIN
// for /api/auth/login, plus one case. Idempotent: safe to re-run over an
// existing database — users are matched on authIdentity, the case on
// caseNumber.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();

const BCRYPT_COST = 12;

const seedUsers = [
  { role: "POLICE_OFFICER", serviceNumber: "BR/2021/6614", pin: "112233" },
  { role: "INVESTIGATING_OFFICER", serviceNumber: "DL/2019/3301", pin: "223344" },
  { role: "COURT_OFFICIAL", serviceNumber: "MH/2020/5512", pin: "334455" },
  { role: "FORENSIC_LAB", serviceNumber: "KA/2022/7891", pin: "445566" },
  { role: "ADMIN", serviceNumber: "NCRB/2018/0001", pin: "556677" },
];

async function main() {
  const users = {};
  for (const { role, serviceNumber, pin } of seedUsers) {
    const authIdentity = `${role.toLowerCase()}@test.digivault`;
    const pinHash = await bcrypt.hash(pin, BCRYPT_COST);
    const user = await prisma.user.upsert({
      where: { authIdentity },
      update: { serviceNumber, pinHash },
      create: { role, department: "Women Safety Division", authIdentity, serviceNumber, pinHash },
    });
    users[role] = user;
    console.log(role.padEnd(22), serviceNumber.padEnd(15), "->", user.id);
  }

  const kase = await prisma.case.upsert({
    where: { caseNumber: "TEST/2026/0001" },
    update: {},
    create: {
      caseNumber: "TEST/2026/0001",
      caseType: "FIR",
      status: "OPEN",
      department: "Women Safety Division",
      createdById: users.INVESTIGATING_OFFICER.id,
    },
  });
  console.log("case ->", kase.id);
}

main().finally(() => prisma.$disconnect());
