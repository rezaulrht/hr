-- The Task 1 catch-all backfilled the seed-removed DESKTOP category as
-- NON_IT; a desktop is unambiguously IT. The seed drops the code, so the
-- upsert never corrects it — this is the one-time data fix.
UPDATE "AssetCategory" SET "classification" = 'IT' WHERE "code" = 'DESKTOP';