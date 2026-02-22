import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export function createServerSupabaseClient() {
  const cookieStore = cookies();
  const headerStore = headers();
  type SetCookieOptions = Omit<Parameters<typeof cookieStore.set>[0], "name" | "value">;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: SetCookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: SetCookieOptions) {
          cookieStore.set({ name, value: "", ...options, maxAge: 0 });
        }
      },
      headers: {
        get(name: string) {
          return headerStore.get(name) ?? undefined;
        }
      }
    }
  );
}
