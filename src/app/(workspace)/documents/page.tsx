import { TopBar } from "@/components/layout/top-bar";

export default function DocumentsPage() {
  return (
    <>
      <TopBar crumbs={["~/workspaces", "Documents"]} />
      <main className="flex flex-1 items-center justify-center text-[12.5px] text-dim">
        Documents — coming soon
      </main>
    </>
  );
}
