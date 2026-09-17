CREATE TABLE "GradingScheme" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GradingScheme_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GradingScheme_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademicSession"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "GradingScheme_sessionId_active_idx" ON "GradingScheme"("sessionId","active");

CREATE TABLE "GradingBand" (
  "id" TEXT NOT NULL,
  "schemeId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "minPercentage" DECIMAL(5,2) NOT NULL,
  "maxPercentage" DECIMAL(5,2) NOT NULL,
  "points" DECIMAL(6,2),
  "pass" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GradingBand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GradingBand_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "GradingScheme"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GradingBand_range_check" CHECK ("minPercentage" >= 0 AND "maxPercentage" <= 100 AND "minPercentage" <= "maxPercentage")
);
CREATE UNIQUE INDEX "GradingBand_schemeId_label_key" ON "GradingBand"("schemeId","label");
CREATE INDEX "GradingBand_schemeId_displayOrder_idx" ON "GradingBand"("schemeId","displayOrder");

ALTER TABLE "Result" ADD COLUMN "gradeLabel" TEXT;

INSERT INTO "GradingScheme" ("id","name","description","active","createdAt","updatedAt")
VALUES ('default-percentage','Default Percentage','Aghaaz default percentage grading scheme',true,NOW(),NOW())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "GradingBand" ("id","schemeId","label","minPercentage","maxPercentage","points","pass","displayOrder") VALUES
('default-a-plus','default-percentage','A+',90,100,4,true,0),
('default-a','default-percentage','A',80,89.99,3.5,true,1),
('default-b-plus','default-percentage','B+',70,79.99,3,true,2),
('default-b','default-percentage','B',60,69.99,2.5,true,3),
('default-c','default-percentage','C',50,59.99,2,true,4),
('default-d','default-percentage','D',40,49.99,1,true,5),
('default-f','default-percentage','F',0,39.99,0,false,6)
ON CONFLICT ("id") DO NOTHING;
