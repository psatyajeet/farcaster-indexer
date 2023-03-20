-- Create new view that lists the top 
CREATE OR REPLACE VIEW public.unique_cast_tags AS
SELECT 
	tag, 
	COUNT(*) as tag_count 
FROM cast_tags 
GROUP BY tag 
ORDER BY tag_count 
DESC;  