import { ConnectForm } from "@/components/connect/ConnectForm";
import { ConnectIntro } from "@/components/connect/ConnectIntro";
import { PublicHeader } from "@/components/connect/PublicHeader";
import { PageShell } from "@/components/kit";

export const metadata = {
  title: "Connect with us | Parisar",
  description:
    "Tell us about your housing society and when to call. We register it with you on the call, and the people you list can sign in.",
};

/** `/connect`: the public Connect With Us form. Replaces /enroll (redirected in middleware). */
export default function ConnectPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main>
        <PageShell width="narrow" className="flex flex-col gap-8">
          <ConnectIntro />
          <ConnectForm />
        </PageShell>
      </main>
    </div>
  );
}
