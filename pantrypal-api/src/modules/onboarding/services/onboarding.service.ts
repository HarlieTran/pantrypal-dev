import { prisma } from "../../../common/db/prisma.js";
import { getUserBySubject } from "../../users/index.js";

export async function getOnboardingQuestions() {
  return prisma.question.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      options: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
    },
  });
}

export async function saveUserAnswers(
  sub: string,
  answers: Array<{ questionKey: string; optionValues?: string[]; answerText?: string }>,
) {
  const user = await getUserBySubject(sub);
  if (!user) throw new Error("User not found");

  const keys = [...new Set(answers.map((a) => a.questionKey))];
  const questions = await prisma.question.findMany({
    where: { key: { in: keys }, isActive: true },
    include: { options: { where: { isActive: true } } },
  });
  const byKey = new Map(questions.map((q) => [q.key, q]));

  await prisma.$transaction(async (tx) => {
    await tx.userAnswer.deleteMany({
      where: { userId: user.id, question: { key: { in: keys } } },
    });

    for (const item of answers) {
      const q = byKey.get(item.questionKey);
      if (!q) continue;

      if (q.type === "FREE_TEXT") {
        const text = item.answerText?.trim();
        if (text) await tx.userAnswer.create({ data: { userId: user.id, questionId: q.id, answerText: text } });
        continue;
      }

      const optionValues = (item.optionValues ?? []).map((v) => v.trim().toLowerCase()).filter(Boolean);
      for (const v of optionValues) {
        const opt = q.options.find((o) => o.value === v);
        if (!opt) continue;
        await tx.userAnswer.create({ data: { userId: user.id, questionId: q.id, optionId: opt.id } });
      }
    }
  });

  return { saved: true };
}

export async function markOnboardingComplete(sub: string) {
  const user = await getUserBySubject(sub);
  if (!user) throw new Error("User not found");
  return prisma.userProfile.update({ where: { id: user.id }, data: { onboardingCompleted: true } });
}
