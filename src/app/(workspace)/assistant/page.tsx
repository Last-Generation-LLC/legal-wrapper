import { TopBar } from "@/components/layout/top-bar";

export default function AssistantPage() {
  return (
    <>
      <TopBar crumbs={["~/workspaces", "Assistant"]} />
      <main className="flex flex-1 items-center justify-center text-[12.5px] text-dim">
        Assistant — coming soon
      </main>
    </>
  );
}
