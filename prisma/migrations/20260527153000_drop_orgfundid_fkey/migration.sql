-- orgFundId stores org book ID (voucher/mirror) OR source transaction ID (split/send).
-- Init migration wrongly enforced FK to Transaction(id) only, breaking org-fund expenses.
ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS "Transaction_orgFundId_fkey";
