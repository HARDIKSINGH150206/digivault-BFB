// One-off manual seed used to smoke-test the step-4 API routes in this
// session (not wired into `prisma db seed` — not a deliverable, just a
// throwaway fixture). Creates one user per role + one case.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const roles = ["POLICE_OFFICER", "INVESTIGATING_OFFICER", "COURT_OFFICIAL", "FORENSIC_LAB", "ADMIN"];

async function main() {
  const users = {};
  for (const role of roles) {
    const user = await prisma.user.create({
      data: { role, department: "Women Safety Division", authIdentity: `${role.toLowerCase()}@test.digivault` },
    });
    users[role] = user;
    console.log(role, "->", user.id);
  }

  const kase = await prisma.case.create({
    data: {
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
