import { runMigrations } from '../src/lib/server/db/migrate';

await runMigrations(process.env.DATABASE_URL!);
