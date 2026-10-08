import { CurrentUserProvider } from "@/context/CurrentUserContext";
import { UIProvider } from "@/context/UIContext";
import { ThemeProvider } from "@/context/ThemeContext";
import AppShell from "@/components/layout/AppShell";

/**
 * Layout for every authenticated page (dashboard, projects, users, ...).
 * middleware.ts already redirects unauthenticated requests to /login before
 * this ever renders; CurrentUserProvider still fetches /api/auth/me itself
 * so client components have the signed-in user's id/role/name to work with.
 */
export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <CurrentUserProvider>
        <UIProvider>
          <AppShell>{children}</AppShell>
        </UIProvider>
      </CurrentUserProvider>
    </ThemeProvider>
  );
}
