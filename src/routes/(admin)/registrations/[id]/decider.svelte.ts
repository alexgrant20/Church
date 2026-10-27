import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import type { SubmitFunction } from '@sveltejs/kit';
import { toast } from 'svelte-sonner';
import { translateError } from '$lib/components/person-errors';

// One decider per page: while any decision is in flight every other submit is dropped, so a
// double tap sends one request and shows one toast.
export function createDecider() {
	let busy = $state(false);

	function submit(success: string, leave = false, check = () => true): SubmitFunction {
		return ({ cancel }) => {
			if (busy || !check()) return cancel();
			busy = true;
			return async ({ result, update }) => {
				if (result.type === 'success') {
					toast.success(success);
					if (leave) return goto(resolve('/registrations'));
					await update();
				} else if (result.type === 'failure') {
					toast.error(translateError(String(result.data?.error)), { duration: Infinity });
				} else {
					await update();
				}
				busy = false;
			};
		};
	}

	return {
		get busy() {
			return busy;
		},
		submit
	};
}
