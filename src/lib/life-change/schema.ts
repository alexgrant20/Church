import { z } from 'zod';
import { addressSchema, date, personSchema } from '$lib/registration/person';

const tomorrowUtc = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

// A coarse guard only: "today" in Jakarta can be tomorrow in UTC. The service makes the exact
// check against the branch's own calendar day.
const pastDate = date.refine((d) => d <= tomorrowUtc(), 'error_date_in_future');

export const passedAwaySchema = z.object({ deceasedOn: pastDate });

export const movedOutSchema = z.object({ address: addressSchema });

const { fullName, nickname, sex, birthDate } = personSchema.shape;

export const marriedNewSchema = z.object({
	weddingOn: pastDate,
	spouse: z.object({ fullName, nickname, sex, birthDate }),
	address: addressSchema
});

export const marriedExistingSchema = z.object({
	weddingOn: pastDate,
	spouseId: z.uuid('error_required'),
	address: addressSchema
});
