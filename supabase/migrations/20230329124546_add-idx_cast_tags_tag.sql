CREATE INDEX idx_btree_cast_tags_tag ON public.cast_tags USING btree (tag);

CREATE INDEX idx_cast_tags_tag ON public.cast_tags USING gin (tag);


