import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export default async function Home() {
  const s = await getSession();
  if (!s) redirect("/login?error=noaccess"); // middleware already guarantees a Supabase user; no role/active SME record means no access
  redirect(s.role === "sme" ? "/sme" : "/admin");
}
