import QRCode from 'qrcode';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { config } from '$lib/server/config';
import { getContext } from '$lib/server/context';
import { decryptSecret, encryptSecret } from '$lib/server/crypto';
import { ForbiddenError, ValidationError } from '$lib/server/errors';
import { getBranch } from '$lib/server/modules/branch/service';
import { recordAudit } from '$lib/server/modules/audit/service';
import { generateSessionToken, hashSessionToken } from '$lib/server/modules/auth/token';
import * as repo from './link-repository';

type BranchLink = { url: string; qrSvg: string };

function requireLinkManager(branchId: string) {
	if (!z.uuid().safeParse(branchId).success) throw new ValidationError('error_bad_branch');
	const { roleAssignments } = getContext();
	const allowed = roleAssignments.some(
		(r) => r.role === 'superadmin' || (r.role === 'branch_admin' && r.branchId === branchId)
	);
	if (!allowed) throw new ForbiddenError();
}

async function toBranchLink(token: string): Promise<BranchLink> {
	const url = `${config.ORIGIN}/register/${token}`;
	return { url, qrSvg: await QRCode.toString(url, { type: 'svg', margin: 1 }) };
}

// Returns the new token, or null when another request created the live link first.
async function createLink(branchId: string, action: string, revoke: boolean) {
	const token = generateSessionToken();
	const personId = getContext().personId!;
	return db.transaction(async (tx) => {
		await repo.lockBranch(tx, branchId);
		const revoked = revoke ? await repo.revokeLiveLink(tx, branchId) : null;
		const link = await repo.insertLink(tx, {
			branchId,
			createdByPersonId: personId,
			tokenHash: hashSessionToken(token),
			tokenEncrypted: encryptSecret(token)
		});
		if (!link) return null;
		await recordAudit(tx, {
			action,
			entityType: 'registration_link',
			entityId: link.id,
			branchId,
			diff: revoked ? { revokedLinkId: revoked.id } : undefined
		});
		return token;
	});
}

export async function getBranchLink(branchId: string): Promise<BranchLink> {
	requireLinkManager(branchId);
	let existing = await repo.findLiveLink(branchId);
	if (!existing) {
		await createLink(branchId, 'registration_link.created', false);
		existing = await repo.findLiveLink(branchId);
	}
	// A seeded link has only a hash, so the token cannot be shown: replace it.
	if (!existing?.tokenEncrypted) return rotateBranchLink(branchId);
	return toBranchLink(decryptSecret(existing.tokenEncrypted));
}

export async function rotateBranchLink(branchId: string): Promise<BranchLink> {
	requireLinkManager(branchId);
	const token = await createLink(branchId, 'registration_link.rotated', true);
	// Branch row lock makes a null here impossible; fail loudly if that ever changes.
	if (!token) throw new Error('registration link rotation lost a race');
	return toBranchLink(token);
}

export async function resolveLink(token: string) {
	return repo.findLinkByHash(hashSessionToken(token));
}

// Opening the page creates or replaces a link, so a superadmin must choose a branch first.
export async function getLinkPage(branchId: string | null) {
	const roles = getContext().roleAssignments;
	const managed = roles.filter((r) => r.role === 'branch_admin');
	const canChooseBranch = roles.some((r) => r.role === 'superadmin') || managed.length > 1;
	const id = branchId ?? managed[0]?.branchId;
	if (!id) return { canChooseBranch, branch: null, link: null };
	const link = await getBranchLink(id);
	const { code, name } = await getBranch(id);
	return { canChooseBranch, branch: { id, code, name }, link };
}
