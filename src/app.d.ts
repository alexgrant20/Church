// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { RoleAssignment } from '$lib/server/context';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: { id: string; email: string | null; name: string } | null;
			roleAssignments: RoleAssignment[];
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
