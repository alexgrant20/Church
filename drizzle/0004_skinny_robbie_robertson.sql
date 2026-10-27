DROP INDEX "registration_consents_person_uniq";--> statement-breakpoint
ALTER TABLE "registration_consents" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "registration_consents_person_uniq" ON "registration_consents" USING btree ("registration_id","person_index") WHERE "registration_consents"."deleted_at" is null;