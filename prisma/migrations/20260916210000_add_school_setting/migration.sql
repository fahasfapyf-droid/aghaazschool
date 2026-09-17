CREATE TABLE "SchoolSetting" (
    "id" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "principalName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "dateFormat" TEXT NOT NULL,
    "grPrefix" TEXT NOT NULL,
    "grDigits" INTEGER NOT NULL,
    "employeePrefix" TEXT NOT NULL,
    "employeeDigits" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolSetting_pkey" PRIMARY KEY ("id")
);
