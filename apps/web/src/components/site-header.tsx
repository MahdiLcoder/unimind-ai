"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useAuth } from "@clerk/nextjs";
import { useState, Suspense } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  BookOpen,
  Sparkles,
  Code2,
  FileSearch,
  Shield,
  Menu,
  Eye,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Workspace", href: "/workspace", icon: FolderKanban },
  { name: "Courses", href: "/courses", icon: BookOpen },
  { name: "Learning", href: "/learning", icon: Sparkles },
  { name: "Coding Lab", href: "/coding", icon: Code2 },
  { name: "Research", href: "/research", icon: FileSearch },
  { name: "Admin", href: "/admin", icon: Shield },
];

function SiteHeaderContent() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="group flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex size-8 items-center justify-center group-hover:bg-primary/90">
              {/* <Eye className="size-5" /> */}
              <Image src='/logo.jpg' alt="logo" width={28} height={28}/>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-bold tracking-tight text-foreground">
                  UniMind
                </span>
                <Badge
                  variant="secondary"
                  className="px-1.5 py-0 text-[10px] font-semibold tracking-wide bg-primary/10 text-primary border-primary/20"
                >
                  AI
                </Badge>
                <Badge
                  variant="outline"
                  className="hidden sm:inline-flex text-[10px] font-medium border-border/70 text-muted-foreground px-1.5 py-0"
                >
                  ISI Kef
                </Badge>
              </div>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav aria-label="Primary" className="hidden lg:flex lg:items-center lg:gap-0.5">
            {navItems.map((item) => {
              const currentPath = pathname ?? "";
              const isActive =
                currentPath === item.href || currentPath.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "bg-muted text-foreground font-semibold"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  <Icon
                    className={cn(
                      "size-3.5",
                      isActive ? "text-foreground" : "text-muted-foreground"
                    )}
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-3">
          {isSignedIn ? (
            <UserButton
              appearance={{
                elements: {
                  avatarBox:
                    "size-8 border-2 border-primary/20 shadow-sm ring-2 ring-background",
                },
              }}
            />
          ) : (
            <div className="hidden sm:flex sm:items-center sm:gap-2">
              <Link
                href="/sign-in"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className={buttonVariants({
                  size: "sm",
                  className: "shadow-sm shadow-primary/20",
                })}
              >
                Get started
              </Link>
            </div>
          )}

          {/* Mobile Menu Trigger via Sheet */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              className={buttonVariants({
                variant: "outline",
                size: "icon-sm",
                className: "lg:hidden cursor-pointer",
              })}
              aria-label="Open mobile navigation menu"
            >
              <Menu className="size-4" />
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-6 sm:w-80">
              <SheetHeader className="text-left">
                <SheetTitle className="flex items-center gap-2 text-base font-semibold">
                  <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                    <Eye className="size-4" />
                  </div>
                  <span>UniMind AI</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium">
                    ISI Kef
                  </Badge>
                </SheetTitle>
              </SheetHeader>
              <nav
                aria-label="Mobile Navigation"
                className="mt-6 flex flex-col gap-1"
              >
                {navItems.map((item) => {
                  const currentPath = pathname ?? "";
                  const isActive =
                    currentPath === item.href ||
                    currentPath.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isActive
                          ? "bg-primary/10 text-primary border border-primary/15"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Icon className="size-4" />
                      {item.name}
                    </Link>
                  );
                })}
              </nav>
              {!isSignedIn && (
                <div className="mt-8 flex flex-col gap-2 border-t pt-4">
                  <Link
                    href="/sign-in"
                    onClick={() => setOpen(false)}
                    className={buttonVariants({
                      variant: "outline",
                      className: "w-full justify-center",
                    })}
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/sign-up"
                    onClick={() => setOpen(false)}
                    className={buttonVariants({
                      className: "w-full justify-center shadow-sm shadow-primary/20",
                    })}
                  >
                    Create account
                  </Link>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

export function SiteHeaderFallback() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="group flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Eye className="size-5" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-bold tracking-tight text-foreground">
                  UniMind
                </span>
                <Badge
                  variant="secondary"
                  className="px-1.5 py-0 text-[10px] font-semibold tracking-wide bg-primary/10 text-primary border-primary/20"
                >
                  AI
                </Badge>
                <Badge
                  variant="outline"
                  className="hidden sm:inline-flex text-[10px] font-medium border-border/70 text-muted-foreground px-1.5 py-0"
                >
                  ISI Kef
                </Badge>
              </div>
            </div>
          </Link>

          <nav aria-label="Primary" className="hidden lg:flex lg:items-center lg:gap-0.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Icon className="size-4 text-muted-foreground" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex sm:items-center sm:gap-2">
            <Link
              href="/sign-in"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className={buttonVariants({
                size: "sm",
              })}
            >
              Get started
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

export function SiteHeader() {
  return (
    <Suspense fallback={<SiteHeaderFallback />}>
      <SiteHeaderContent />
    </Suspense>
  );
}
