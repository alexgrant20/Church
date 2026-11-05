import { z } from 'zod';
import { addressSchema, date, today } from '$lib/registration/person';

// The service repeats the future check against the branch's own calendar day.
export const passedAwaySchema = z.object({
	deceasedOn: date.refine((d) => d <= today(), 'error_date_in_future')
});

export const movedOutSchema = z.object({ address: addressSchema });
