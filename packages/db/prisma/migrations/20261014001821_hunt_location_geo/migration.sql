-- Hunt location (decision 0017): "Your area" on the user, coordinates on the Hunt, and a cache of
-- place lookups for listing distance checks. Additive only.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "areaLabel" TEXT,
ADD COLUMN     "areaLat" DOUBLE PRECISION,
ADD COLUMN     "areaLng" DOUBLE PRECISION,
ADD COLUMN     "areaPostalCode" TEXT,
ADD COLUMN     "areaUpdatedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Hunt" ADD COLUMN     "locationLat" DOUBLE PRECISION,
ADD COLUMN     "locationLng" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "GeoPlaceCache" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "countryCode" CHAR(2),
    "resolvedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeoPlaceCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GeoPlaceCache_key_key" ON "GeoPlaceCache"("key");

-- CreateIndex
CREATE INDEX "GeoPlaceCache_resolvedAt_idx" ON "GeoPlaceCache"("resolvedAt");

-- Coordinates come in pairs and stay on the globe.
ALTER TABLE "User" ADD CONSTRAINT "User_area_point_check"
  CHECK (("areaLat" IS NULL AND "areaLng" IS NULL)
      OR ("areaLat" BETWEEN -90 AND 90 AND "areaLng" BETWEEN -180 AND 180));
ALTER TABLE "Hunt" ADD CONSTRAINT "Hunt_location_point_check"
  CHECK (("locationLat" IS NULL AND "locationLng" IS NULL)
      OR ("locationLat" BETWEEN -90 AND 90 AND "locationLng" BETWEEN -180 AND 180));
ALTER TABLE "GeoPlaceCache" ADD CONSTRAINT "GeoPlaceCache_point_check"
  CHECK (("lat" IS NULL AND "lng" IS NULL)
      OR ("lat" BETWEEN -90 AND 90 AND "lng" BETWEEN -180 AND 180));