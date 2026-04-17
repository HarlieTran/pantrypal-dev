import { z } from "zod";
import { withAuth } from "../../auth/index.js";
import { getOnboardingQuestions, saveUserAnswers, markOnboardingComplete } from "../index.js";
import { handleError, ok, parseBody, type JsonResponse } from "../../../common/routing/helpers.js";

const answersSchema = z.object({
  answers: z.array(z.object({
    questionKey: z.string().min(1),
    optionValues: z.array(z.string()).optional(),
    answerText: z.string().max(500).optional(),
  })),
});

export async function handleOnboardingRoute(
  method: string,
  path: string,
  authHeader?: string,
  rawBody?: string,
): Promise<JsonResponse | null> {
  if (method === "GET" && path === "/onboarding/questions") {
    const questions = await getOnboardingQuestions();
    return ok({ questions });
  }

  if (method === "PUT" && path === "/me/answers") {
    return withAuth(authHeader, async (claims) => {
      try {
        const data = parseBody(rawBody, answersSchema);
        const result = await saveUserAnswers(claims.sub, data.answers);
        return ok(result);
      } catch (err) {
        return handleError(err, "Failed to save answers");
      }
    });
  }

  if (method === "POST" && path === "/me/onboarding/complete") {
    return withAuth(authHeader, async (claims) => {
      try {
        const profile = await markOnboardingComplete(claims.sub);
        return ok({ profile });
      } catch (err) {
        return handleError(err, "Failed to complete onboarding");
      }
    });
  }

  return null;
}
