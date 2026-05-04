"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Radar,
  KanbanSquare,
  FileText,
  Image,
  Calendar,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";

import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { logout as apiLogout } from "@/lib/api/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { SidebarItem } from "./sidebar-item";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/trends", label: "Trends", icon: Radar },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/content", label: "Content", icon: FileText },
  { href: "/media", label: "Media", icon: Image },
  { href: "/schedule", label: "Schedule", icon: Calendar },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings/keywords", label: "Settings", icon: Settings },
];

function SidebarContent() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout: storeLogout, refreshToken } = useAuthStore();

  const initials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() ?? "U";

  async function handleLogout() {
    try {
      if (refreshToken) await apiLogout(refreshToken);
    } catch {
      // ignore logout API errors
    }
    storeLogout();
    router.push("/login");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center bg-foreground text-background text-xs font-bold">
            MC
          </div>
          <span className="text-sm font-semibold tracking-tight">
            Marketing AI
          </span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => (
          <SidebarItem
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            isActive={
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href)
            }
          />
        ))}
      </nav>

      <Separator />

      <div className="p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 truncate">
            <p className="truncate text-sm font-medium">
              {user?.displayName || user?.email}
            </p>
            {user?.displayName && (
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { isSidebarOpen, setSidebarOpen } = useUIStore();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r bg-sidebar lg:block">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      <Sheet open={isSidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="fixed left-3 top-3 z-40 lg:hidden"
          >
            {isSidebarOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-60 p-0">
          <SidebarContent />
        </SheetContent>
      </Sheet>
    </>
  );
}
