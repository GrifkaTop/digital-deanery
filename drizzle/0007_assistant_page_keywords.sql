DROP INDEX "assistant_fragment_search_idx";--> statement-breakpoint
ALTER TABLE "assistant_fragments" ADD COLUMN "keywords" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "assistant_fragment_search_idx" ON "assistant_fragments" USING gin (to_tsvector('russian'::regconfig, "text" || ' ' || "keywords"));