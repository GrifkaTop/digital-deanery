CREATE TABLE "assistant_fragments" (
	"document_id" text NOT NULL,
	"position" integer NOT NULL,
	"page" integer NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "assistant_fragments_document_id_position_pk" PRIMARY KEY("document_id","position"),
	CONSTRAINT "assistant_fragment_location" CHECK ("assistant_fragments"."position" > 0 AND "assistant_fragments"."page" > 0)
);
--> statement-breakpoint
CREATE TABLE "assistant_publications" (
	"id" text PRIMARY KEY NOT NULL,
	"revision" text NOT NULL,
	"title" text NOT NULL,
	"number" text NOT NULL,
	"issued_on" date NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_publication_id" CHECK (length("assistant_publications"."id") <= 64 AND "assistant_publications"."id" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "assistant_publication_revision" CHECK ("assistant_publications"."revision" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "assistant_fragments" ADD CONSTRAINT "assistant_fragments_document_id_assistant_publications_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."assistant_publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_fragment_search_idx" ON "assistant_fragments" USING gin (to_tsvector('russian'::regconfig, "text"));