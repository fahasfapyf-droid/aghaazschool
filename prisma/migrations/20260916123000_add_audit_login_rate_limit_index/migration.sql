-- Speed up recent failed-login lookups used by the authentication rate limiter.
CREATE INDEX "AuditLog_action_ipAddress_createdAt_idx"
ON "AuditLog"("action", "ipAddress", "createdAt");
