export { login, logout, currentUser, requireUser, hashPassword, clientIp, type SessionUser } from "./session";
export { can, assertCan, clubScope, canReviewPayments, ROLE_LABELS, type Capability } from "./permissions";

import type { SessionUser } from "./session";
import type { Actor } from "@/modules/audit";
export const actorOf = (u: SessionUser, ip?: string | null): Actor => ({ id: u.id, role: u.role, clubId: u.clubId, ip });
