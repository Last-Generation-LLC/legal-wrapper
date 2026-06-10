-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "title" TEXT,
    "mimeType" TEXT NOT NULL,
    "extractedText" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "tokenCountEstimated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Document" ("createdAt", "extractedText", "filename", "id", "mimeType", "title", "tokenCount") SELECT "createdAt", "extractedText", "filename", "id", "mimeType", "title", "tokenCount" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
