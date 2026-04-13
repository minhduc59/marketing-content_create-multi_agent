"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { useAuthStore } from "@/stores/auth-store";
import { getMe } from "@/lib/api/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Skeleton } from "@/components/ui/skeleton";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, hydrate, setUser } =
    useAuthStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const { isLoading: isUserLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const user = await getMe();
      setUser(user);
      return user;
    },
    enabled: isAuthenticated,
    retry: false,
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || (!isAuthenticated && !isUserLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin border-2 border-foreground border-t-transparent" />
      </div>
    );
  }

  if (isUserLoading) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-60 border-r bg-sidebar lg:block">
          <div className="space-y-4 p-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
        <div className="flex-1">
          <div className="h-14 border-b" />
          <div className="space-y-4 p-6">
            <Skeleton className="h-8 w-48" />
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col lg:ml-60">
        <Header />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
