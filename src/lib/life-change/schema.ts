import { z } from 'zod';
import { addressSchema, date } from '$lib/registration/person';

const tomorrowUtc = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

// A coarse guard only: "today" in Jakarta can be tomorrow in UTC. The service makes the exact
// check against the branch's own calendar day.
export const passedAwaySchema = z.object({
	deceasedOn: date.refine((d) => d <= tomorrowUtc(), 'error_date_in_future')
});

export const movedOutSchema = z.object({ address: addressSchema });
