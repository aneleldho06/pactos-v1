import { createFileRoute } from "@tanstack/react-router";
import { AgreementCard } from "@/components/agreements/AgreementCard";
import { mockAgreements } from "@/lib/mock";

export const Route = createFileRoute("/_app/agreements")({
  component: AgreementsPage,
});

function AgreementsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl sm:text-4xl">Agreements</h1>
      <p className="mt-1 text-sm text-muted-foreground">All programmable financial contracts in your workspace.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mockAgreements.map((a) => <AgreementCard key={a.id} a={a} />)}
      </div>
    </div>
  );
}