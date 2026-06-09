import { Button } from "@/components/ui/button";

// Server Component: this runs on the server, so it can read .env.local.
// We only ever expose whether the key is PRESENT — never the value itself.
export default function Home() {
  const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Legal Document Workspace
        </h1>
        <p className="max-w-md text-muted-foreground">
          Local-first scaffold is live. Toolchain check below confirms
          Next.js, Tailwind, and shadcn/ui are wired up.
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 text-sm">
          <span
            aria-hidden
            className={
              hasApiKey
                ? "size-2.5 rounded-full bg-green-500"
                : "size-2.5 rounded-full bg-red-500"
            }
          />
          <span className="font-medium">
            ANTHROPIC_API_KEY:{" "}
            {hasApiKey ? "configured" : "missing — add it to .env.local"}
          </span>
        </div>
        <Button>shadcn/ui button renders</Button>
      </div>
    </main>
  );
}
