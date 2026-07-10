import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import DeveloperClient from "./developer-client";

export default async function DeveloperPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  return <DeveloperClient />;
}
