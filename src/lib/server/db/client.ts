import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '$lib/server/config';
import * as schema from './schema';

const queryClient = postgres(config.DATABASE_URL);

export const db = drizzle(queryClient, { schema, casing: 'snake_case' });

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
