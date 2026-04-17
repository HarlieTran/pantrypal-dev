import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const region = process.env.COGNITO_REGION!;
const userPoolId = process.env.COGNITO_USER_POOL_ID!;
const appClientId = process.env.COGNITO_APP_CLIENT_ID!;

const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

export type AuthClaims = JWTPayload & {
  sub: string;
  email?: string;
  token_use?: string;
  given_name?: string;
  family_name?: string;
};

export async function verifyCognitoToken(token: string): Promise<AuthClaims> {
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    audience: appClientId,
  });

  const claims = payload as AuthClaims;
  if (!claims.sub) throw new Error("Missing sub claim");
  if (claims.token_use && claims.token_use !== "id") {
    throw new Error("Expected ID token");
  }

  return claims;
}
