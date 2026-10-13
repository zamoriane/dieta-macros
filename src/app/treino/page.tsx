"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { me } from "@/lib/data";
import { PageHeader, Skeleton } from "@/components/ui/Primitives";
import { WorkoutSession } from "@/components/treino/WorkoutSession";
import { WorkoutEditor } from "@/components/treino/WorkoutEditor";

type Tab = "treinar" | "plano";

export default function TreinoPage() {
  const sb = useMemo(() => createClient(), []);
  const [uid, setUid] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>("treinar");

  useEffect(() => {
    (async () => {
      setUid(await me(sb));
      const { data: links } = await sb.rpc("my_links");
      const n: Record<string, string> = {};
      for (const l of (links ?? []) as { outra_id: string; outra_nome: string | null; papel: string }[]) {
        n[l.outra_id] = `${l.outra_nome ?? "Treinador"}${l.papel === "cliente" ? " (treinador)" : ""}`;
      }
      setNames(n);
    })();
  }, [sb]);

  const tabBtn = (t: Tab, label: string) => (
    <button
      role="tab"
      aria-selected={tab === t}
      onClick={() => setTab(t)}
      className={`min-h-9 flex-1 rounded-lg px-4 font-medium ${tab === t ? "bg-accent text-on-accent" : "text-muted"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Treino" subtitle="Registe as séries do treino do dia e acompanhe a evolução das cargas." />
      <div className="flex rounded-xl border border-line bg-card p-1 text-sm sm:w-fit" role="tablist">
        {tabBtn("treinar", "Treinar")}
        {tabBtn("plano", "Plano de treino")}
      </div>
      {!uid ? (
        <Skeleton className="h-64" />
      ) : tab === "treinar" ? (
        <WorkoutSession ownerId={uid} onEditPlan={() => setTab("plano")} />
      ) : (
        <WorkoutEditor ownerId={uid} viewerId={uid} names={names} />
      )}
    </div>
  );
}
