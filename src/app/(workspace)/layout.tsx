import { Rail } from "@/components/layout/rail";

// Persistent shell for the three workspace sections: fixed Rail on the left,
// flexible main column on the right. The TopBar is composed per page (d5).
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-1">
      <Rail />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
