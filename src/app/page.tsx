import { redirect } from "next/navigation";

// The app opens on the Assistant. The root path has no UI of its own.
export default function Home() {
  redirect("/assistant");
}
