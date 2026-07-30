-- Leave Without Pay predates the accrual model, so the previous migration
-- gave it the column default PRO_RATED. It has no entitlement to pro-rate.
--
-- Corrected here rather than in the seed on purpose: the seed does not
-- rewrite existing non-statutory rows, which is what stops a future
-- statutory amendment from resetting a company-policy benefit HR has tuned.
-- Weakening that guard to fix one row would trade a real protection for a
-- cosmetic default.
UPDATE "LeaveType" SET "accrualBasis" = 'NONE' WHERE "code" = 'LWP';
