-- Historical schema captured from RemDo 8d6a1a20 / Better Auth 1.7.0.
-- Synthetic fixture; keep independent of future migration implementation.
CREATE TABLE "account" ("id" text not null primary key, "issuer" text not null, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);

CREATE TABLE document_access (
    document_id TEXT NOT NULL,
    grantee_user_id TEXT NOT NULL,
    PRIMARY KEY(document_id, grantee_user_id)
  );

CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    document_kind TEXT NOT NULL DEFAULT 'document'
      CHECK (document_kind IN ('document', 'home-document', 'user-data-projection')),
    title TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

CREATE TABLE "jwks" ("id" text not null primary key, "publicKey" text not null, "privateKey" text not null, "createdAt" date not null, "expiresAt" date, "alg" text, "crv" text);

CREATE TABLE "oauthAccessToken" ("id" text not null primary key, "token" text not null unique, "clientId" text not null references "oauthClient" ("clientId") on delete cascade, "sessionId" text references "session" ("id") on delete set null, "userId" text references "user" ("id") on delete cascade, "referenceId" text, "authorizationCodeId" text, "resources" text, "requestedUserInfoClaims" text, "refreshId" text references "oauthRefreshToken" ("id") on delete cascade, "expiresAt" date not null, "createdAt" date not null, "revoked" date, "confirmation" text, "scopes" text not null);

CREATE TABLE "oauthClient" ("id" text not null primary key, "clientId" text not null unique, "clientSecret" text, "clientDiscoveryId" text, "disabled" integer, "skipConsent" integer, "enableEndSession" integer, "subjectType" text, "scopes" text, "clientCredentialsScopes" text, "userId" text references "user" ("id") on delete cascade, "createdAt" date, "updatedAt" date, "name" text, "uri" text, "icon" text, "contacts" text, "tos" text, "policy" text, "softwareId" text, "softwareVersion" text, "softwareStatement" text, "redirectUris" text not null, "postLogoutRedirectUris" text, "backchannelLogoutUri" text, "backchannelLogoutSessionRequired" integer, "tokenEndpointAuthMethod" text, "applicationType" text, "jwks" text, "jwksUri" text, "grantTypes" text, "responseTypes" text, "requirePKCE" integer, "dpopBoundAccessTokens" integer, "referenceId" text, "metadata" text);

CREATE TABLE "oauthClientAssertion" ("id" text not null primary key, "expiresAt" date not null);

CREATE TABLE "oauthClientResource" ("id" text not null primary key, "clientId" text not null references "oauthClient" ("clientId") on delete cascade, "resourceId" text not null references "oauthResource" ("identifier") on delete cascade, "metadata" text, "createdAt" date);

CREATE TABLE "oauthConsent" ("id" text not null primary key, "clientId" text not null references "oauthClient" ("clientId") on delete cascade, "userId" text references "user" ("id") on delete cascade, "referenceId" text, "resources" text, "requestedUserInfoClaims" text, "scopes" text not null, "createdAt" date not null, "updatedAt" date not null);

CREATE TABLE "oauthRefreshToken" ("id" text not null primary key, "token" text not null unique, "clientId" text not null references "oauthClient" ("clientId") on delete cascade, "sessionId" text references "session" ("id") on delete set null, "userId" text not null references "user" ("id") on delete cascade, "referenceId" text, "authorizationCodeId" text, "resources" text, "requestedUserInfoClaims" text, "expiresAt" date not null, "createdAt" date not null, "revoked" date, "rotatedAt" date, "rotationReplayResponse" text, "rotationReplayExpiresAt" date, "authTime" date, "confirmation" text, "scopes" text not null);

CREATE TABLE "oauthResource" ("id" text not null primary key, "identifier" text not null unique, "name" text not null, "accessTokenTtl" integer, "refreshTokenTtl" integer, "signingAlgorithm" text, "signingKeyId" text, "allowedScopes" text, "customClaims" text, "dpopBoundAccessTokensRequired" integer, "disabled" integer, "createdAt" date, "updatedAt" date, "policyVersion" integer, "metadata" text);

CREATE TABLE "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade, "impersonatedBy" text);

CREATE TABLE source_servers (
    base_url TEXT PRIMARY KEY,
    client_id TEXT,
    created_at INTEGER NOT NULL
  );

CREATE TABLE "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null, "role" text, "banned" integer, "banReason" text, "banExpires" date);

CREATE TABLE "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);

CREATE UNIQUE INDEX "account_issuer_accountId_uidx" on "account" ("issuer", "accountId");

CREATE INDEX "account_userId_idx" on "account" ("userId");

CREATE UNIQUE INDEX documents_unique_owner_special_kind
    ON documents(owner_user_id, document_kind)
    WHERE document_kind IN ('home-document', 'user-data-projection');

CREATE INDEX "oauthAccessToken_authorizationCodeId_idx" on "oauthAccessToken" ("authorizationCodeId");

CREATE INDEX "oauthAccessToken_clientId_idx" on "oauthAccessToken" ("clientId");

CREATE INDEX "oauthAccessToken_refreshId_idx" on "oauthAccessToken" ("refreshId");

CREATE INDEX "oauthAccessToken_sessionId_idx" on "oauthAccessToken" ("sessionId");

CREATE INDEX "oauthAccessToken_userId_idx" on "oauthAccessToken" ("userId");

CREATE INDEX "oauthClientResource_clientId_idx" on "oauthClientResource" ("clientId");

CREATE UNIQUE INDEX "oauthClientResource_clientId_resourceId_uidx" on "oauthClientResource" ("clientId", "resourceId");

CREATE INDEX "oauthClientResource_resourceId_idx" on "oauthClientResource" ("resourceId");

CREATE INDEX "oauthClient_userId_idx" on "oauthClient" ("userId");

CREATE INDEX "oauthConsent_clientId_idx" on "oauthConsent" ("clientId");

CREATE INDEX "oauthConsent_userId_idx" on "oauthConsent" ("userId");

CREATE INDEX "oauthRefreshToken_authorizationCodeId_idx" on "oauthRefreshToken" ("authorizationCodeId");

CREATE INDEX "oauthRefreshToken_clientId_idx" on "oauthRefreshToken" ("clientId");

CREATE INDEX "oauthRefreshToken_sessionId_idx" on "oauthRefreshToken" ("sessionId");

CREATE INDEX "oauthRefreshToken_userId_idx" on "oauthRefreshToken" ("userId");

CREATE INDEX "session_userId_idx" on "session" ("userId");

CREATE INDEX "verification_identifier_idx" on "verification" ("identifier");

-- Synthetic records created with Better Auth 1.7.0.
INSERT INTO "user" ("id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt", "role", "banned", "banReason", "banExpires") VALUES ('xDuyIlhQnWFZglKvZihkXRp3AZQaVpPC', 'Baseline User', 'baseline@example.test', 0, NULL, '2026-09-14T15:58:37.277Z', '2026-09-14T15:58:37.277Z', 'admin', 0, NULL, NULL);
INSERT INTO "account" ("id", "issuer", "accountId", "providerId", "userId", "accessToken", "refreshToken", "idToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", "scope", "password", "createdAt", "updatedAt") VALUES ('Qu4BeA2UWGdwUoWXk0edgHvPKN7ISIYr', 'local:credential', 'xDuyIlhQnWFZglKvZihkXRp3AZQaVpPC', 'credential', 'xDuyIlhQnWFZglKvZihkXRp3AZQaVpPC', NULL, NULL, NULL, NULL, NULL, NULL, '43ca1be9777e78b40497a6726f986b4f:debb04a1dd1020fcad98499dc4ea46d5cb72f8fc6ae1389058e8dc673f1c248977b6a4bf8864380685380e418e8afa96e41cd83abe63e60ab184d0eaaa2e88b7', '2026-09-14T15:58:37.278Z', '2026-09-14T15:58:37.278Z');
INSERT INTO "account" ("id", "issuer", "accountId", "providerId", "userId", "accessToken", "refreshToken", "idToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", "scope", "password", "createdAt", "updatedAt") VALUES ('historical-source-account', 'https://source.example', 'remote-user', 'aHR0cHM6Ly9zb3VyY2UuZXhhbXBsZQ', 'xDuyIlhQnWFZglKvZihkXRp3AZQaVpPC', 'historical-access-token', 'historical-refresh-token', NULL, NULL, NULL, NULL, NULL, 123, 123);
INSERT INTO "document_access" ("document_id", "grantee_user_id") VALUES ('historical-document', 'historical-grantee');
INSERT INTO "documents" ("id", "owner_user_id", "document_kind", "title", "created_at", "updated_at") VALUES ('historical-document', 'xDuyIlhQnWFZglKvZihkXRp3AZQaVpPC', 'document', 'Preserved document', 123, 456);
INSERT INTO "oauthResource" ("id", "identifier", "name", "accessTokenTtl", "refreshTokenTtl", "signingAlgorithm", "signingKeyId", "allowedScopes", "customClaims", "dpopBoundAccessTokensRequired", "disabled", "createdAt", "updatedAt", "policyVersion", "metadata") VALUES ('GuBDal4dAJveRhwaYhpnL8BOWSxjGeGJ', 'http://127.0.0.1:4000', 'http://127.0.0.1:4000', NULL, NULL, NULL, NULL, NULL, 'null', 0, 0, '2026-09-14T15:58:37.199Z', '2026-09-14T15:58:37.199Z', 1, 'null');
INSERT INTO "session" ("id", "expiresAt", "token", "createdAt", "updatedAt", "ipAddress", "userAgent", "userId", "impersonatedBy") VALUES ('E2TancPf3s3MOWc2FPCAWG6JmfR6KZtz', 4070908800000, 'EAap3t1ZRvU9uSYnEFxw1hoKzmsrrnbR', '2026-09-14T15:58:37.278Z', '2026-09-14T15:58:37.278Z', '127.0.0.1', '', 'xDuyIlhQnWFZglKvZihkXRp3AZQaVpPC', NULL);
INSERT INTO "source_servers" ("base_url", "client_id", "created_at") VALUES ('https://source.example', 'historical-client', 123);
