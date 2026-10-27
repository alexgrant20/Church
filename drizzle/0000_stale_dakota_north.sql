CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."otp_channel" AS ENUM('whatsapp', 'email');--> statement-breakpoint
CREATE TYPE "public"."otp_purpose" AS ENUM('login', 'activation', 'password_reset');--> statement-breakpoint
CREATE TYPE "public"."relationship_kind" AS ENUM('parent', 'spouse');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('superadmin', 'pastor', 'branch_admin', 'group_admin');--> statement-breakpoint
CREATE TYPE "public"."attachment_owner" AS ENUM('person', 'branch');--> statement-breakpoint
CREATE TYPE "public"."attachment_purpose" AS ENUM('profile_photo', 'church_photo');--> statement-breakpoint
CREATE TYPE "public"."education" AS ENUM('none', 'primary', 'junior_high', 'senior_high', 'diploma', 'bachelor', 'master', 'doctorate');--> statement-breakpoint
CREATE TYPE "public"."occupation" AS ENUM('none', 'student', 'employee', 'civil_servant', 'entrepreneur', 'professional', 'homemaker', 'retired', 'other');--> statement-breakpoint
CREATE TYPE "public"."consent_decision" AS ENUM('waiting', 'given', 'declined');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."registration_status" AS ENUM('pending', 'needs_fix', 'approved', 'spam');--> statement-breakpoint
CREATE TABLE "cities" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"region_id" uuid NOT NULL,
	"code" varchar(10),
	"name" varchar(150) NOT NULL,
	CONSTRAINT "cities_region_name_uniq" UNIQUE("region_id","name")
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"iso2" char(2) NOT NULL,
	"name" varchar(100) NOT NULL,
	CONSTRAINT "countries_iso2_unique" UNIQUE("iso2")
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"country_id" uuid NOT NULL,
	"code" varchar(10),
	"name" varchar(150) NOT NULL,
	CONSTRAINT "regions_country_name_uniq" UNIQUE("country_id","name")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(255),
	"phone" varchar(20),
	"password_hash" varchar(255),
	"activated_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_phone_unique" UNIQUE("phone"),
	CONSTRAINT "accounts_email_or_phone" CHECK ("accounts"."email" is not null or "accounts"."phone" is not null)
);
--> statement-breakpoint
CREATE TABLE "login_throttles" (
	"identifier_hash" char(64) PRIMARY KEY NOT NULL,
	"failed_count" smallint DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"person_id" uuid NOT NULL,
	"purpose" "otp_purpose" NOT NULL,
	"channel" "otp_channel" NOT NULL,
	"code_hash" char(64) NOT NULL,
	"challenge_hash" char(64) NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "otp_codes_challengeHash_unique" UNIQUE("challenge_hash")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" char(64) PRIMARY KEY NOT NULL,
	"person_id" uuid NOT NULL,
	"acting_as_person_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" varchar(8) NOT NULL,
	"name" varchar(255) NOT NULL,
	"address_line" varchar(500) NOT NULL,
	"postal_code" varchar(10),
	"city_id" uuid NOT NULL,
	"timezone" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "member_code_counters" (
	"branch_id" uuid NOT NULL,
	"year" smallint NOT NULL,
	"last_number" integer NOT NULL,
	CONSTRAINT "member_code_counters_branch_id_year_pk" PRIMARY KEY("branch_id","year")
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"is_member" boolean DEFAULT true NOT NULL,
	"member_code" varchar(20),
	"full_name" varchar(255) NOT NULL,
	"nickname" varchar(100),
	"chinese_name" varchar(50),
	"sex" "sex" NOT NULL,
	"birth_date" date NOT NULL,
	"birth_city_id" uuid,
	"nik_encrypted" "bytea",
	"nik_hash" char(64),
	"preferred_locale" varchar(7) DEFAULT 'id' NOT NULL,
	"home_branch_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"registered_by_person_id" uuid,
	"address_line" varchar(500) NOT NULL,
	"postal_code" varchar(10),
	"city_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "people_member_code_matches_is_member" CHECK (("people"."member_code" is not null) = "people"."is_member"),
	CONSTRAINT "people_nik_hash_hex" CHECK ("people"."nik_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "person_relationships" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" "relationship_kind" NOT NULL,
	"person_id" uuid NOT NULL,
	"related_person_id" uuid NOT NULL,
	"started_on" date,
	"ended_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "person_relationships_not_self" CHECK ("person_relationships"."person_id" <> "person_relationships"."related_person_id"),
	CONSTRAINT "person_relationships_spouse_order" CHECK ("person_relationships"."kind" <> 'spouse' or "person_relationships"."person_id" < "person_relationships"."related_person_id")
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"person_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"branch_id" uuid,
	"group_id" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "role_assignments_scope" CHECK (("role_assignments"."role" = 'superadmin' and "role_assignments"."branch_id" is null and "role_assignments"."group_id" is null)
				or ("role_assignments"."role" in ('pastor', 'branch_admin') and "role_assignments"."branch_id" is not null and "role_assignments"."group_id" is null)
				or ("role_assignments"."role" = 'group_admin' and "role_assignments"."group_id" is not null and "role_assignments"."branch_id" is null))
);
--> statement-breakpoint
CREATE TABLE "error_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"route" varchar(255),
	"method" varchar(10),
	"person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by_person_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_type" "attachment_owner" NOT NULL,
	"owner_id" uuid NOT NULL,
	"purpose" "attachment_purpose" NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"storage_key" varchar(255) NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" char(64) NOT NULL,
	"uploaded_by_person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "attachments_storageKey_unique" UNIQUE("storage_key"),
	CONSTRAINT "attachments_content_type_allowed" CHECK ("attachments"."content_type" in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf'))
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_person_id" uuid,
	"on_behalf_of_person_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid NOT NULL,
	"branch_id" uuid,
	"diff" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_profiles" (
	"person_id" uuid PRIMARY KEY NOT NULL,
	"occupation" "occupation" NOT NULL,
	"education" "education" NOT NULL,
	"previous_church" varchar(255),
	"baptized" boolean NOT NULL,
	"baptism_date" date,
	"baptism_church" varchar(255),
	"sidi" boolean NOT NULL,
	"sidi_date" date,
	"sidi_church" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_profiles_baptism_details" CHECK ("member_profiles"."baptized" = ("member_profiles"."baptism_date" is not null) and "member_profiles"."baptized" = ("member_profiles"."baptism_church" is not null)),
	CONSTRAINT "member_profiles_sidi_details" CHECK ("member_profiles"."sidi" = ("member_profiles"."sidi_date" is not null) and "member_profiles"."sidi" = ("member_profiles"."sidi_church" is not null))
);
--> statement-breakpoint
CREATE TABLE "outbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"channel" "otp_channel" NOT NULL,
	"recipient" varchar(255) NOT NULL,
	"template" varchar(50) NOT NULL,
	"locale" varchar(7) NOT NULL,
	"params" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "registration_consents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"registration_id" uuid NOT NULL,
	"person_index" smallint NOT NULL,
	"matched_person_id" uuid NOT NULL,
	"token_hash" char(64),
	"decision" "consent_decision" DEFAULT 'waiting' NOT NULL,
	"decided_at" timestamp with time zone,
	"recorded_by_person_id" uuid,
	CONSTRAINT "registration_consents_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "registration_links" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"token_hash" char(64) NOT NULL,
	"branch_id" uuid NOT NULL,
	"created_by_person_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "registration_links_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "registration_throttles" (
	"key_hash" char(64) PRIMARY KEY NOT NULL,
	"count" smallint NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"registration_link_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"status" "registration_status" DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"locale" varchar(7) NOT NULL,
	"contact_email" varchar(255),
	"contact_phone" varchar(20),
	"fix_reason" text,
	"fix_token_hash" char(64),
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by_person_id" uuid,
	"decided_at" timestamp with time zone,
	"household_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registrations_fixTokenHash_unique" UNIQUE("fix_token_hash"),
	CONSTRAINT "registrations_contact" CHECK ("registrations"."contact_email" is not null or "registrations"."contact_phone" is not null)
);
--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_acting_as_person_id_people_id_fk" FOREIGN KEY ("acting_as_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_code_counters" ADD CONSTRAINT "member_code_counters_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_birth_city_id_cities_id_fk" FOREIGN KEY ("birth_city_id") REFERENCES "public"."cities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_home_branch_id_branches_id_fk" FOREIGN KEY ("home_branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_registered_by_person_id_people_id_fk" FOREIGN KEY ("registered_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_relationships" ADD CONSTRAINT "person_relationships_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_relationships" ADD CONSTRAINT "person_relationships_related_person_id_people_id_fk" FOREIGN KEY ("related_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "error_logs" ADD CONSTRAINT "error_logs_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_person_id_people_id_fk" FOREIGN KEY ("updated_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_person_id_people_id_fk" FOREIGN KEY ("uploaded_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_person_id_people_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_on_behalf_of_person_id_people_id_fk" FOREIGN KEY ("on_behalf_of_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_profiles" ADD CONSTRAINT "member_profiles_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_consents" ADD CONSTRAINT "registration_consents_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_consents" ADD CONSTRAINT "registration_consents_matched_person_id_people_id_fk" FOREIGN KEY ("matched_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_consents" ADD CONSTRAINT "registration_consents_recorded_by_person_id_people_id_fk" FOREIGN KEY ("recorded_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_links" ADD CONSTRAINT "registration_links_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_links" ADD CONSTRAINT "registration_links_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_registration_link_id_registration_links_id_fk" FOREIGN KEY ("registration_link_id") REFERENCES "public"."registration_links"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_decided_by_person_id_people_id_fk" FOREIGN KEY ("decided_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cities_region_id_index" ON "cities" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "cities_name_trgm_idx" ON "cities" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "regions_country_id_index" ON "regions" USING btree ("country_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_email_uniq" ON "accounts" USING btree (lower("email")) WHERE "accounts"."email" is not null;--> statement-breakpoint
CREATE INDEX "otp_codes_person_id_purpose_created_at_index" ON "otp_codes" USING btree ("person_id","purpose","created_at");--> statement-breakpoint
CREATE INDEX "sessions_person_id_index" ON "sessions" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "branches_code_uniq" ON "branches" USING btree ("code") WHERE "branches"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "branches_city_id_index" ON "branches" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "groups_branch_id_index" ON "groups" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "people_home_branch_id_id_index" ON "people" USING btree ("home_branch_id","id");--> statement-breakpoint
CREATE INDEX "people_household_id_index" ON "people" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "people_city_id_index" ON "people" USING btree ("city_id");--> statement-breakpoint
CREATE UNIQUE INDEX "people_nik_hash_uniq" ON "people" USING btree ("nik_hash") WHERE "people"."nik_hash" is not null and "people"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "people_member_code_uniq" ON "people" USING btree ("member_code") WHERE "people"."member_code" is not null and "people"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "people_full_name_trgm_idx" ON "people" USING gin ("full_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "people_nickname_trgm_idx" ON "people" USING gin ("nickname" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "people_chinese_name_trgm_idx" ON "people" USING gin ("chinese_name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "person_relationships_uniq" ON "person_relationships" USING btree ("kind","person_id","related_person_id") WHERE "person_relationships"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "person_relationships_person_id_index" ON "person_relationships" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "person_relationships_related_person_id_index" ON "person_relationships" USING btree ("related_person_id");--> statement-breakpoint
CREATE INDEX "role_assignments_person_id_index" ON "role_assignments" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_assignments_uniq" ON "role_assignments" USING btree ("person_id","role",coalesce("branch_id", '00000000-0000-0000-0000-000000000000'),coalesce("group_id", '00000000-0000-0000-0000-000000000000')) WHERE "role_assignments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "error_logs_created_at_index" ON "error_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_owner_position_uniq" ON "attachments" USING btree ("owner_type","owner_id","purpose","position") WHERE "attachments"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_profile_photo_uniq" ON "attachments" USING btree ("owner_id") WHERE "attachments"."purpose" = 'profile_photo' and "attachments"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_branch_created_idx" ON "audit_logs" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_created_idx" ON "audit_logs" USING btree ("actor_person_id","created_at");--> statement-breakpoint
CREATE INDEX "outbox_messages_status_next_attempt_at_index" ON "outbox_messages" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "registration_consents_person_uniq" ON "registration_consents" USING btree ("registration_id","person_index");--> statement-breakpoint
CREATE UNIQUE INDEX "registration_links_live_branch_uniq" ON "registration_links" USING btree ("branch_id") WHERE "registration_links"."revoked_at" is null and "registration_links"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "registrations_branch_id_status_submitted_at_id_index" ON "registrations" USING btree ("branch_id","status","submitted_at","id");