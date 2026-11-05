import { db, type Transaction } from '$lib/server/db/client';
import { getContext } from '$lib/server/context';
import { ForbiddenError } from '$lib/server/errors';
import { recordAudit } from '$lib/server/modules/audit/service';
import { scopeFor } from '$lib/server/modules/branch/access';
import { SETTINGS, type SettingKey, type SettingValue } from './keys';
import * as repo from './repository';

export async function getSetting<K extends SettingKey>(
	key: K,
	tx?: Transaction
): Promise<SettingValue<K>> {
	const row = await repo.findSetting(key, tx);
	const value = row ? SETTINGS[key].schema.parse(row.value) : SETTINGS[key].default;
	// TypeScript cannot narrow SETTINGS[K] through a generic index; the schema guarantees the type.
	return value as SettingValue<K>;
}

export async function setSetting<K extends SettingKey>(key: K, value: SettingValue<K>) {
	scopeFor(['superadmin']);
	const after = SETTINGS[key].schema.parse(value);
	await db.transaction(async (tx) => {
		// Read under the row lock, so two superadmins saving at once audit true befores.
		const before = await getSetting(key, tx);
		if (before === after) return;
		const row = await repo.upsertSetting(tx, key, after, getContext().personId);
		await recordAudit(tx, {
			action: 'setting.changed',
			entityType: 'system_setting',
			entityId: row.id,
			branchId: null,
			diff: { value: { before, after } }
		});
	});
}

export async function getEditableSettings() {
	scopeFor(['superadmin']);
	return { familyTreeEnabled: await getSetting('membership.family_tree_enabled') };
}

export function canEditSettings(): boolean {
	try {
		scopeFor(['superadmin']);
		return true;
	} catch (err) {
		if (err instanceof ForbiddenError) return false;
		throw err;
	}
}
