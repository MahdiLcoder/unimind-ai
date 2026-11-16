import type { Metadata } from "next";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "UniMind AI",
  description: "Your intelligent university assistant",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("h-full antialiased", "font-sans", geist.variable)}>
      <body className="flex min-h-full flex-col">
        <ClerkProvider
          dynamic
          publishableKey={
            process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
            process.env.CLERK_PUBLISHABLE_KEY
          }
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          appearance={{ theme: shadcn }}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
