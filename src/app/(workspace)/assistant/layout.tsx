import { listDocuments } from "@/lib/documents";
import { DocsProvider } from "@/components/documents/docs-context";
import { DocSidebar } from "@/components/documents/doc-sidebar";

// Force dynamic rendering so Next.js does not try to statically prerender
// this route at build time (listDocuments() requires a runtime SQLite DB).
export const dynamic = "force-dynamic";

// Assistant-scoped shell (d1): the document sidebar lives here, not in the
// global (workspace) layout — Review has its own layout. The Server Component
// seeds the client provider with the list (d2); the future Assistant chat (#9)
// reads the same selection via useDocs().
export default async function AssistantLayout({
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
