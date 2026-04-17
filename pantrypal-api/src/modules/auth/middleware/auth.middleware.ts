import { verifyCognitoToken, type AuthClaims } from "../../../common/auth/jwt.js";

export async function requireAuth(req: {
  headers: { authorization?: string };
}): Promise<AuthClaims> {
  const authHeader = req.headers.authorization ?? "";
  if (!authHeader.startsWith("Bearer ")) throw new Error("Unauthorized");

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) throw new Error("Unauthorized");

  return verifyCognitoToken(token);
}
