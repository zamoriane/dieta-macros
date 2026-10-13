"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ZERO, type Targets } from "@/lib/nutrition";
import { avgOuraActive, computeDay, getProfile, isoDay, latestWeight } from "@/lib/data";
import { PageHeader, Skeleton } from "@/components/ui/Primitives";
import { PlanEditor } from "@/components/plano/PlanEditor";

export default function PlanoPage() {
  const sb = useMemo(() => createClient(), []);
  const [uid, setUid] = useState<string | null>(null);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const p = await getProfile(sb);
      setUid(p.id);
      const today = isoDay();
      const [w, avg, { data: links }] = await Promise.all([
        latestWeight(sb, today),
        avgOuraActive(sb, today, 14, p.fonte_atividade ?? "oura"),
        sb.rpc("my_links"),
      ]);
      const calc = computeDay(p, w?.kg ?? null, ZERO, null, today, { isToday: true, avgActive: avg });
      setTargets(calc?.targets ?? null);
      const n: Record<string, string> = {};
      for (const l of (links ?? []) as { outra_id: string; outra_nome: string | null; papel: string }[]) {
        n[l.outra_id] = `${l.outra_nome ?? "Treinador"}${l.papel === "cliente" ? " (treinador)" : ""}`;
      }
      setNames(n);
    })();
  }, [sb]);

  return (
    <div className="space-y-5">
      <PageHeader title="Plano base" subtitle="O modelo do seu dia: cada dia novo começa como cópia deste plano." />
      {uid ? <PlanEditor ownerId={uid} viewerId={uid} targets={targets} names={names} /> : <Skeleton className="h-64" />}
    </div>
  );
}
