import { AppShell } from "@/components/layout/app-shell";

/**
 * Single entry point. The shell decides between the setup gate, a
 * configuration error, and the full dashboard based on live server state.
 */
export default function HomePage() {
  return <AppShell />;
}
