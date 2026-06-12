-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChatSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" DATETIME,
    "selectedDocIds" TEXT NOT NULL DEFAULT '[]'
);
INSERT INTO "new_ChatSession" ("createdAt", "id", "title") SELECT "createdAt", "id", "title" FROM "ChatSession";
DROP TABLE "ChatSession";
ALTER TABLE "new_ChatSession" RENAME TO "ChatSession";
CREATE TABLE "new_Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatSessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_chatSessionId_fkey" FOREIGN KEY ("chatSessionId") REFERENCES "ChatSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Message" ("chatSessionId", "content", "createdAt", "id", "role") SELECT "chatSessionId", "content", "createdAt", "id", "role" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
CREATE INDEX "Message_chatSessionId_idx" ON "Message"("chatSessionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
