CREATE TABLE "project_panoramas" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"object_path" text NOT NULL,
	"label" text NOT NULL,
	"location" text NOT NULL,
	"capture_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_panoramas_object_path_unique" UNIQUE("object_path")
);
