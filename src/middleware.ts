import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Coarse gate + session refresh only. Real authorisation happens in server code (requireRole / assertOwnership).
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await sb.auth.getUser();
  const path = req.nextUrl.pathname;
  const isPublic = path.startsWith("/login") || path.startsWith("/api/health") || path.startsWith("/api/cron") || path.startsWith("/auth/");
  if (!data.user && !isPublic) {
    if (path.startsWith("/api/")) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return res;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
