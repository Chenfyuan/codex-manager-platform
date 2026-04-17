import { Header } from "./Header";
import { CliStatusBanner } from "../dashboard/CliStatusBanner";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-bg-dark flex h-screen w-screen flex-col overflow-hidden text-neutral-100">
      <Header />
      <div className="px-6 pt-4">
        <CliStatusBanner />
      </div>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
