import { SignIn } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <Suspense fallback={<p role="status">Loading sign-in…</p>}>
        <SignIn path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/dashboard" />
      </Suspense>
    </main>
  );
}
