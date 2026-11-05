import { z } from 'zod';

// Every setting the code knows; reading any other key is a type error, a wrong stored type throws.
export const SETTINGS = {
	'household.adults_act_for_activated_adults': { schema: z.boolean(), default: true },
	'membership.family_tree_enabled': { schema: z.boolean(), default: true }
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]['schema']>;
