CREATE TABLE "emails" (
	"seq" bigserial NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"to" text,
	"subject" text DEFAULT '',
	"body" text DEFAULT '',
	"category" text DEFAULT 'general',
	"delivery" text DEFAULT 'pending',
	"provider" text DEFAULT 'log',
	"error" text,
	"created_at" text NOT NULL,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "files" (
	"seq" bigserial NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"purpose" text DEFAULT '',
	"stored_name" text NOT NULL,
	"original_name" text DEFAULT '',
	"mimetype" text DEFAULT '',
	"size" integer DEFAULT 0,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "investments" (
	"seq" bigserial NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"plan_name" text DEFAULT '',
	"amount" numeric(20, 2) DEFAULT 0 NOT NULL,
	"roi_percent" double precision DEFAULT 0 NOT NULL,
	"period_hours" double precision DEFAULT 24 NOT NULL,
	"duration_days" double precision DEFAULT 30 NOT NULL,
	"principal_return" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" text,
	"ends_at" text,
	"last_accrual_at" text,
	"accrued_total" numeric(20, 2) DEFAULT 0 NOT NULL,
	"payouts_count" integer DEFAULT 0 NOT NULL,
	"completed_at" text,
	"cancelled_at" text,
	"created_at" text NOT NULL,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "kyc" (
	"seq" bigserial NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"document_type" text DEFAULT '',
	"document_number" text DEFAULT '',
	"document_file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" text,
	"review_note" text DEFAULT '',
	"created_at" text NOT NULL,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "login_events" (
	"seq" bigserial NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"email" text DEFAULT '',
	"result" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"at" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"seq" bigserial NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '',
	"level" text DEFAULT 'info' NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"seq" bigserial NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '',
	"min_amount" numeric(20, 2) DEFAULT 0 NOT NULL,
	"max_amount" numeric(20, 2) DEFAULT 0 NOT NULL,
	"roi_percent" double precision DEFAULT 0 NOT NULL,
	"period_hours" double precision DEFAULT 24 NOT NULL,
	"duration_days" double precision DEFAULT 30 NOT NULL,
	"principal_return" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "popups" (
	"seq" bigserial NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '',
	"level" text DEFAULT 'info' NOT NULL,
	"cta_label" text DEFAULT '',
	"cta_url" text DEFAULT '',
	"audience" text DEFAULT 'all' NOT NULL,
	"user_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"seen_by" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"seq" bigserial NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"referrer_id" text NOT NULL,
	"referee_id" text NOT NULL,
	"referee_email" text DEFAULT '',
	"bonus_amount" numeric(20, 2) DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" text,
	"created_at" text NOT NULL,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "robots" (
	"seq" bigserial NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text DEFAULT '',
	"status" text DEFAULT 'active' NOT NULL,
	"stake" numeric(20, 2) DEFAULT 0 NOT NULL,
	"duration_days" double precision DEFAULT 0,
	"profit_target_percent" double precision DEFAULT 0,
	"target_profit" numeric(20, 2) DEFAULT 0 NOT NULL,
	"symbols" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"win_rate" double precision DEFAULT 0.72,
	"interval_minutes" double precision DEFAULT 5,
	"started_by" text,
	"created_by" text,
	"started_at" text,
	"ends_at" text,
	"last_run_at" text,
	"completed_at" text,
	"completion_reason" text,
	"stats" jsonb DEFAULT '{"trades":0,"wins":0,"losses":0,"netPnl":0}'::jsonb NOT NULL,
	"stopped_at" text,
	"stopped_by" text,
	"created_at" text NOT NULL,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"seq" bigserial NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"brand_name" text DEFAULT 'MT5 Smart Market',
	"base_currency" text DEFAULT 'USD',
	"referral_percent" double precision DEFAULT 5,
	"withdrawal_fee_percent" double precision DEFAULT 2,
	"min_withdrawal" numeric(20, 2) DEFAULT 50,
	"max_withdrawal" numeric(20, 2) DEFAULT 0,
	"min_deposit" numeric(20, 2) DEFAULT 20,
	"require_kyc_for_withdrawal" boolean DEFAULT true,
	"email_alerts_enabled" boolean DEFAULT true,
	"support_email" text DEFAULT '',
	"ai_bot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"bank_deposit" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"crypto_methods" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"market_symbols" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" text,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"seq" bigserial NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"location" text DEFAULT '',
	"rating" integer DEFAULT 5 NOT NULL,
	"plan" text DEFAULT '',
	"text" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"seq" bigserial NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"symbol" text,
	"side" text,
	"lots" double precision DEFAULT 0,
	"leverage" double precision DEFAULT 1,
	"entry_price" double precision DEFAULT 0,
	"exit_price" double precision,
	"margin" numeric(20, 2) DEFAULT 0 NOT NULL,
	"notional" numeric(20, 2) DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"pnl" numeric(20, 2) DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'user' NOT NULL,
	"opened_at" text,
	"closed_at" text,
	"closed_by" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"seq" bigserial NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(20, 2) DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"method" text,
	"reference" text,
	"note" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"balance_after" numeric(20, 2),
	"created_at" text NOT NULL,
	"processed_at" text,
	"updated_at" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"seq" bigserial NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"balance" numeric(20, 2) DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"account_type" text DEFAULT '',
	"country" text DEFAULT '',
	"phone" text DEFAULT '',
	"date_of_birth" text DEFAULT '',
	"address_line1" text DEFAULT '',
	"address_line2" text DEFAULT '',
	"city" text DEFAULT '',
	"state_province" text DEFAULT '',
	"postal_code" text DEFAULT '',
	"security_question" text DEFAULT '',
	"security_answer_hash" text,
	"referral_code" text,
	"referred_by" text,
	"kyc_status" text DEFAULT 'unverified' NOT NULL,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"avatar_file_id" text,
	"rejection_reason" text,
	"frozen_reason" text DEFAULT '',
	"frozen_at" text,
	"frozen_by" text,
	"created_at" text NOT NULL,
	"updated_at" text,
	"approved_at" text,
	"approved_by" text,
	"last_login_at" text,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"seq" bigserial NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text DEFAULT '',
	"network" text DEFAULT '',
	"asset" text DEFAULT '',
	"address" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text
);
