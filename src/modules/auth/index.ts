export { login, logout, currentUser, requireUser, hashPassword, clientIp, currentSessionHash, type SessionUser } from "./session";
export { changeOwnPassword, requestPasswordReset, resetPassword, findValidReset, RESET_MINUTES, MIN_PASSWORD } from "./password";
export { can, assertCan, clubScope, canReviewPayments, ROLE_LABELS, isReadOnly, assertWriter, assertCompany, READ_ONLY_ROLES, type Capability } from "./permissions";

import type { SessionUser } from "./session";
import type { Actor } from "@/modules/audit";
export const actorOf = (u: SessionUser, ip?: string | null): Actor => ({ id: u.id, role: u.role, clubId: u.clubId, ip });

import { requireUser as _requireUser } from "./session";
import { assertWriter as _assertWriter } from "./permissions";
/** Usuario del panel que puede escribir (la empresa, producción). Los usuarios del club son de consulta. */
export async function requireWriter() {
  const u = await _requireUser();
  _assertWriter(u);
  return u;
}
