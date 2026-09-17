CREATE TABLE "LibraryBook" (
  "id" TEXT NOT NULL,
  "isbn" TEXT,
  "title" TEXT NOT NULL,
  "author" TEXT,
  "publisher" TEXT,
  "category" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LibraryBook_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LibraryBook_title_idx" ON "LibraryBook"("title");
CREATE INDEX "LibraryBook_category_idx" ON "LibraryBook"("category", "active");

CREATE TABLE "LibraryCopy" (
  "id" TEXT NOT NULL,
  "bookId" TEXT NOT NULL,
  "accessionNumber" TEXT NOT NULL,
  "condition" TEXT NOT NULL DEFAULT 'GOOD',
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LibraryCopy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LibraryCopy_accession_key" ON "LibraryCopy"("accessionNumber");
CREATE INDEX "LibraryCopy_book_status_idx" ON "LibraryCopy"("bookId", "status");
ALTER TABLE "LibraryCopy" ADD CONSTRAINT "LibraryCopy_book_fkey" FOREIGN KEY ("bookId") REFERENCES "LibraryBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LibraryLoan" (
  "id" TEXT NOT NULL,
  "copyId" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "returnedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ISSUED',
  "fineAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LibraryLoan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LibraryLoan_student_status_idx" ON "LibraryLoan"("enrollmentId", "status", "dueAt");
CREATE INDEX "LibraryLoan_copy_status_idx" ON "LibraryLoan"("copyId", "status");
ALTER TABLE "LibraryLoan" ADD CONSTRAINT "LibraryLoan_copy_fkey" FOREIGN KEY ("copyId") REFERENCES "LibraryCopy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LibraryLoan" ADD CONSTRAINT "LibraryLoan_enrollment_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
