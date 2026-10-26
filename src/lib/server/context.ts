import { AsyncLocalStorage } from 'node:async_hooks';

export type RoleAssignment = {
	role: 'superadmin' | 'pastor' | 'branch_admin' | 'group_admin';
	branchId: string | null;
	groupId: string | null;
};

export type RequestContext = {
	personId: string | null;
	actingAsPersonId: string | null;
	roleAssignments: RoleAssignment[];
	ip: string;
};

const als = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
	return als.run(ctx, fn);
}

export function getContext(): RequestContext {
	const ctx = als.getStore();
	if (!ctx) throw new Error('Request context accessed outside of a request lifecycle');
	return ctx;
}
