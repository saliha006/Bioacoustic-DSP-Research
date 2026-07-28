-- Xeno-canto recordings are Creative Commons, so we store who recorded each
-- reference and under which licence, plus a link back to its Xeno-canto page.
-- The frontend shows this as a credit while the reference plays.
alter table example_calls
  add column if not exists recordist text,
  add column if not exists license text,
  add column if not exists source_url text,
  -- 1 = the best clip (the category box plays it), 2 = the alternate take
  add column if not exists rank smallint not null default 1;
