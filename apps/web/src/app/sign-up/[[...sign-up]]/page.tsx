import { SignUp } from "@clerk/nextjs";
import { Suspense } from "react";

export default function SignUpPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <Suspense fallback={<p role="status">Loading sign-up…</p>}>
        <SignUp path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/dashboard" />
      </Suspense>
    </main>
  );
}
