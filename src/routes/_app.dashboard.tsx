import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Plus, Wallet, Activity, TrendingUp, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/agreements/StatCard";
import { AgreementCard } from "@/components/agreements/AgreementCard";
import { ActivityCard } from "@/components/activity/ActivityCard";
import { mockAgreements, mockActivity, monthlyVolume, mockUser } from "@/lib/mock";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const spark = monthlyVolume.slice(-8).map((d) => ({ v: d.v }));
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Welcome back</div>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl">Hey, {mockUser.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Here's what your money is doing today.</p>
        </div>
        <Button asChild size="lg" className="rounded-full">
          <Link to="/builder"><Plus className="h-4 w-4" />Create Agreement</Link>
        </Button>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Agreements" value="6" delta="+2 this month" icon={Activity} spark={spark} />
        <StatCard label="Volume (30d)" value="$14.2k" delta="+18.4%" icon={TrendingUp} spark={spark} />
        <StatCard label="Total Recipients" value="18" delta="+3" icon={Wallet} spark={spark} />
        <StatCard label="Execution success" value="99.8%" delta="+0.2%" icon={CheckCircle2} spark={spark} />
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section>
          <div className="mb-4 flex items-end justify-between">
            <h2 className="font-display text-2xl">Your agreements</h2>
            <Link to="/agreements" className="text-sm text-muted-foreground hover:text-foreground">View all →</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {mockAgreements.map((a, i) => (
              <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <AgreementCard a={a} />
              </motion.div>
            ))}
          </div>
        </section>
        <section>
          <div className="mb-4 flex items-end justify-between">
            <h2 className="font-display text-2xl">Live activity</h2>
            <Link to="/activity" className="text-sm text-muted-foreground hover:text-foreground">All →</Link>
          </div>
          <div className="space-y-2.5">
            {mockActivity.slice(0, 7).map((e) => <ActivityCard key={e.id} e={e} />)}
          </div>
        </section>
      </div>
    </div>
  );
}