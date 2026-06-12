import { listDocuments } from "@/lib/documents";
import { DocsProvider } from "@/components/documents/docs-context";
import { DocSidebar } from "@/components/documents/doc-sidebar";

// Force dynamic rendering so Next.js does not try to statically prerender
// this route at build time (listDocuments() requires a runtime SQLite DB).
export const dynamic = "force-dynamic";

// Review-scoped shell, mirroring the Assistant's (d1): the document sidebar
// supplies the grid's rows — the same shared selection model both tabs use.
export default async function ReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const documents = await listDocuments();
  return (
    <DocsProvider documents={documents}>
      <div className="flex min-w-0 flex-1">
        <DocSidebar />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </DocsProvider>
  );
}
