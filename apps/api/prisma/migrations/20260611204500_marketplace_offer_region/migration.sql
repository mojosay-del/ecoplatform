-- Public buyer region for at_gate offers. Exact city stays hidden from the
-- seller until offer acceptance.
ALTER TABLE "Offer" ADD COLUMN "region" TEXT;
