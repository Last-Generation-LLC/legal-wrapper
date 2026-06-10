import { TopBar } from "@/components/layout/top-bar";

export default function ReviewPage() {
  return (
    <>
      <TopBar crumbs={["~/workspaces", "Review"]} />
      <main className="flex flex-1 items-center justify-center text-[12.5px] text-dim">
        Review — coming soon
      </main>
    </>
  );
}
