-- Add imageUrls and videoUrls to Complaint
ALTER TABLE "Complaint" ADD COLUMN "imageUrls" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Complaint" ADD COLUMN "videoUrls" TEXT[] NOT NULL DEFAULT '{}';
