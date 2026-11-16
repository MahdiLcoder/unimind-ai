import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware(
  async (auth) => {
    await auth.protect();
  },
  {
    publishableKey:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
      process.env.CLERK_PUBLISHABLE_KEY,
    signInUrl: "/sign-in",
    signUpUrl: "/sign-up",
  },
);

export const config = {
  matcher: [
    "/admin(.*)",
    "/coding(.*)",
    "/courses(.*)",
    "/dashboard(.*)",
    "/learning(.*)",
    "/research(.*)",
    "/workspace(.*)",
    "/api(.*)",
    "/trpc(.*)",
  ],
};
