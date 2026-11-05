import { z } from 'zod';

export const settingsFormSchema = z.object({ familyTreeEnabled: z.boolean() });
