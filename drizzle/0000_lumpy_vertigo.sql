CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."relationship_kind" AS ENUM('parent', 'spouse');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('superadmin', 'pastor', 'branch_admin', 'group_admin', 'member');--> statement-breakpoint
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
CREATE TABLE "sessions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255),
	"phone" varchar(32),
	"password_hash" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
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
	"member_code" varchar(20) NOT NULL,
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
	CONSTRAINT "people_memberCode_unique" UNIQUE("member_code"),
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
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"branch_id" uuid,
	"group_id" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid NOT NULL,
	"branch_id" uuid,
	"diff" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cities_region_id_index" ON "cities" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "cities_name_trgm_idx" ON "cities" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "regions_country_id_index" ON "regions" USING btree ("country_id");--> statement-breakpoint
CREATE UNIQUE INDEX "branches_code_uniq" ON "branches" USING btree ("code") WHERE "branches"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "branches_city_id_index" ON "branches" USING btree ("city_id");--> statement-breakpoint
CREATE INDEX "groups_branch_id_index" ON "groups" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "people_home_branch_id_id_index" ON "people" USING btree ("home_branch_id","id");--> statement-breakpoint
CREATE INDEX "people_household_id_index" ON "people" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "people_city_id_index" ON "people" USING btree ("city_id");--> statement-breakpoint
CREATE UNIQUE INDEX "people_nik_hash_uniq" ON "people" USING btree ("nik_hash") WHERE "people"."nik_hash" is not null and "people"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "people_full_name_trgm_idx" ON "people" USING gin ("full_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "people_nickname_trgm_idx" ON "people" USING gin ("nickname" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "people_chinese_name_trgm_idx" ON "people" USING gin ("chinese_name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "person_relationships_uniq" ON "person_relationships" USING btree ("kind","person_id","related_person_id") WHERE "person_relationships"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "person_relationships_person_id_index" ON "person_relationships" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "person_relationships_related_person_id_index" ON "person_relationships" USING btree ("related_person_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_created_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");