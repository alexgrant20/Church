// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { RoleAssignment } from '$lib/server/context';
import type { Theme } from '$lib/theme';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			person: { id: string; fullName: string } | null;
			actingAsPersonId: string | null;
			roleAssignments: RoleAssignment[];
			theme: Theme;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
