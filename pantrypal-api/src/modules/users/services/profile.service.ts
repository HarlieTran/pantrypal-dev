import { prisma } from "../../../common/db/prisma.js";
import type { AuthClaims } from "../../../common/auth/jwt.js";

const AUTH_PROVIDER = "cognito";

export async function upsertUserProfileFromClaims(claims: AuthClaims) {
  const email = claims.email ?? "";
  const firstName = claims.given_name?.trim() || null;
  const lastName = claims.family_name?.trim() || null;

  const profile = await prisma.userProfile.upsert({
    where: { authProvider_authSubject: { authProvider: AUTH_PROVIDER, authSubject: claims.sub } },
    update: { email, firstName, lastName },
    create: {
      authProvider: AUTH_PROVIDER,
      authSubject: claims.sub,
      email,
      firstName,
      lastName,
      displayName: firstName,
    },
  });

  if (!profile.displayName && firstName) {
    return prisma.userProfile.update({ where: { id: profile.id }, data: { displayName: firstName } });
  }
  return profile;
}

export async function getUserBySubject(sub: string) {
  return prisma.userProfile.findUnique({
    where: { authProvider_authSubject: { authProvider: AUTH_PROVIDER, authSubject: sub } },
  });
}

export async function getUserProfileIdBySubject(sub: string): Promise<string | null> {
  const user = await prisma.userProfile.findUnique({
    where: { authProvider_authSubject: { authProvider: AUTH_PROVIDER, authSubject: sub } },
    select: { id: true },
  });
  return user?.id ?? null;
}

export async function getUserProfile(sub: string) {
  const user = await prisma.userProfile.findUnique({
    where: { authProvider_authSubject: { authProvider: AUTH_PROVIDER, authSubject: sub } },
    include: {
      preferenceProfile: true,
      answers: {
        include: {
          question: { select: { key: true, label: true, type: true } },
          option: { select: { label: true, value: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    onboardingCompleted: user.onboardingCompleted,
    createdAt: user.createdAt,
    preferenceProfile: user.preferenceProfile
      ? {
          likes: user.preferenceProfile.likes as string[],
          dislikes: user.preferenceProfile.dislikes as string[],
          dietSignals: user.preferenceProfile.dietSignals as string[],
          confidence: user.preferenceProfile.confidence,
        }
      : null,
    answers: user.answers.map((a) => ({
      question: a.question,
      option: a.option ?? null,
      answerText: a.answerText ?? null,
    })),
  };
}

export async function updateUserProfile(
  sub: string,
  payload: {
    displayName?: string;
    likes?: string;
    dietType?: string[];
    allergies?: string[];
    disliked?: string;
    notes?: string;
  },
) {
  const user = await prisma.userProfile.findUnique({
    where: { authProvider_authSubject: { authProvider: AUTH_PROVIDER, authSubject: sub } },
    select: { id: true, preferenceProfile: { select: { id: true } } },
  });
  if (!user) throw new Error("User not found");

  const questions = await prisma.question.findMany({
    where: { isActive: true },
    include: { options: true },
  });

  const findQ = (keys: string[], labels: string[]) =>
    questions.find((q) => keys.includes(q.key)) ??
    questions.find((q) => labels.some((l) => q.label.toLowerCase().includes(l)));

  const dietQ = findQ(["diet"], ["diet"]);
  const allergyQ = findQ(["allergies"], ["allerg"]);
  const dislikedQ = findQ(["disliked_ingredients"], ["disliked"]);
  const notesQ = findQ(["diet_notes"], ["diet notes"]);

  await prisma.$transaction(async (tx) => {
    if (typeof payload.displayName === "string") {
      await tx.userProfile.update({
        where: { id: user.id },
        data: { displayName: payload.displayName.trim() || null },
      });
    }

    if (dietQ && Array.isArray(payload.dietType)) {
      await tx.userAnswer.deleteMany({ where: { userId: user.id, questionId: dietQ.id } });
      const selected = dietQ.options.filter((o) =>
        payload.dietType!.map((v) => v.trim().toLowerCase()).includes(o.value),
      );
      if (selected.length) {
        await tx.userAnswer.createMany({
          data: selected.map((o) => ({ userId: user.id, questionId: dietQ.id, optionId: o.id })),
        });
      }
    }

    if (allergyQ && Array.isArray(payload.allergies)) {
      await tx.userAnswer.deleteMany({ where: { userId: user.id, questionId: allergyQ.id } });
      const selected = allergyQ.options.filter((o) =>
        payload.allergies!.map((v) => v.trim().toLowerCase()).includes(o.value),
      );
      if (selected.length) {
        await tx.userAnswer.createMany({
          data: selected.map((o) => ({ userId: user.id, questionId: allergyQ.id, optionId: o.id })),
        });
      }
    }

    if (dislikedQ && typeof payload.disliked === "string") {
      await tx.userAnswer.deleteMany({ where: { userId: user.id, questionId: dislikedQ.id } });
      const text = payload.disliked.trim();
      if (text) await tx.userAnswer.create({ data: { userId: user.id, questionId: dislikedQ.id, answerText: text } });
    }

    if (notesQ && typeof payload.notes === "string") {
      await tx.userAnswer.deleteMany({ where: { userId: user.id, questionId: notesQ.id } });
      const text = payload.notes.trim();
      if (text) await tx.userAnswer.create({ data: { userId: user.id, questionId: notesQ.id, answerText: text } });
    }

    if (user.preferenceProfile?.id) {
      const splitCsv = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
      await tx.userPreferenceProfile.update({
        where: { id: user.preferenceProfile.id },
        data: {
          ...(payload.likes !== undefined ? { likes: splitCsv(payload.likes) } : {}),
          ...(payload.disliked !== undefined ? { dislikes: splitCsv(payload.disliked) } : {}),
          ...(payload.dietType !== undefined ? { dietSignals: payload.dietType } : {}),
        },
      });
    }
  });

  return getUserProfile(sub);
}
