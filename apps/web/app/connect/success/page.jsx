import { ConnectSuccess } from "@/components/connect/ConnectSuccess";
import { PublicHeader } from "@/components/connect/PublicHeader";
import { PageShell } from "@/components/kit";

export const metadata = {
  title: "Your request | Parisar",
  description: "Your Connect With Us request: request ID, call time and status.",
  robots: { index: false, follow: false },
};

/** `/connect/success?code=PR-XXXX-XXXX`: confirmation after submitting, or a status lookup. */
export default async function ConnectSuccessPage({ searchParams }) {
  const params = await searchParams;
  const code = typeof params?.code === "string" ? params.code : "";
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main>
        <PageShell width="narrow">
          <ConnectSuccess code={code} />
        </PageShell>
      </main>
    </div>
  );
}
