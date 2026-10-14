-- Stripe 'unpaid' (retries exhausted) gets its own status: not entitled (decision 0018). Additive.

-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE 'UNPAID';
