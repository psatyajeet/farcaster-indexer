create table IF NOT EXISTS "public"."cast_tags" (
    "id" bigint generated by default as identity not null,
    "cast_hash" text not null,
    "tag" text not null
);


alter table "public"."cast_tags" enable row level security;

CREATE UNIQUE INDEX cast_tags_pkey ON public.cast_tags USING btree (id);

CREATE UNIQUE INDEX unique_cast_hash_tag ON public.cast_tags USING btree (cast_hash, tag);

alter table "public"."cast_tags" add constraint "cast_tags_pkey" PRIMARY KEY using index "cast_tags_pkey";

alter table "public"."cast_tags" add constraint "cast_tags_cast_hash_fkey" FOREIGN KEY (cast_hash) REFERENCES casts(hash) not valid;

alter table "public"."cast_tags" validate constraint "cast_tags_cast_hash_fkey";

alter table "public"."cast_tags" add constraint "unique_cast_hash_tag" UNIQUE using index "unique_cast_hash_tag";


