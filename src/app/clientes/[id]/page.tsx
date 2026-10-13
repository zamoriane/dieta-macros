"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ZERO, type Targets } from "@/lib/nutrition";
import { addDays, avgOuraActive, computeDay, getActivityDays, getClientProfile, isoDay, me as myId, type OuraDay, type Profile } from "@/lib/data";
import { myLinks, type Link as TLink } from "@/lib/links";
import { EmptyState, SectionCard, Skeleton, StatusBadge } from "@/components/ui/Primitives";
import { Icon } from "@/components/ui/Icon";
import { PlanEditor } from "@/components/plano/PlanEditor";
import { WorkoutEditor } from "@/components/treino/WorkoutEditor";
import { WeightChart } from "@/components/resumo/WeightChart";
import { CalorieChart, type CalDay } from "@/components/resumo/CalorieChart";

type Tab = "plano" | "treino" | "progresso";

export default function ClientePage() {
  const { id } = useParams<{ id: string }>();
  const sb = useMemo(() => createClient(), []);
  const [viewer, setViewer] = useState<string | null>(null);
  const [link, setLink] = useState<TLink | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [targets, setTargets] = useState<Targets | null>(null);
  const [tab, setTab] = useState<Tab>("plano");
  const [weights, setWeights] = useState<{ dia: string; kg: number }[]>([]);
  const [days, setDays] = useState<CalDay[]>([]);

  useEffect(() => {
    (async () => {
      const [uid, links] = await Promise.all([myId(sb), myLinks(sb).catch(() => [] as TLink[])]);
      setViewer(uid);
      const l = links.find((x) => x.papel === "treinador" && x.outra_id === id && x.status === "ativo") ?? null;
      setLink(l);
      if (!l) return;
      if (!l.perm_dieta) setTab(l.perm_treino ? "treino" : "progresso");
      const p = await getClientProfile(sb, id);
      setProfile(p);
      if (!p || !l.perm_progresso) return;

      // Progresso: últimos 14 dias + pesos de 120 dias
      const today = isoDay();
      const from = addDays(today, -13);
      const src = p.fonte_atividade ?? "oura";
      const [{ data: totals }, { data: w }, act, avg] = await Promise.all([
        sb.from("daily_totals").select("*").eq("user_id", id).gte("dia", from).lte("dia", today),
        sb.from("weights").select("dia,kg").eq("user_id", id).gte("dia", addDays(today, -150)).order("dia"),
        getActivityDays(sb, from, today, src, id),
        avgOuraActive(sb, today, 14, src, id),
      ]);
      const ws = (w ?? []).map((x) => ({ dia: x.dia as string, kg: Number(x.kg) }));
      setWeights(ws);
      const weightAt = (d: string) => [...ws].reverse().find((x) => x.dia <= d)?.kg ?? null;
      const tBy = new Map((totals ?? []).map((t) => [t.dia as string, t]));
      const aBy = new Map((act as OuraDay[]).map((a) => [a.dia, a]));
      const out: CalDay[] = [];
      for (let d = from; d <= today; d = addDays(d, 1)) {
        const t = tBy.get(d);
        const m = t ? { kcal: Number(t.kcal), protein: Number(t.protein), carbs: Number(t.carbs), fat: Number(t.fat), fiber: Number(t.fiber) } : null;
        const c = m ? computeDay(p, weightAt(d), m, aBy.get(d) ?? null, d, { isToday: d === today, avgActive: avg }) : null;
        out.push({ dia: d, kcal: m?.kcal ?? null, gasto: c?.balance.expenditure ?? null, deficit: c?.balance.deficit ?? null });
      }
      setDays(out);
      const tc = computeDay(p, weightAt(today), ZERO, null, today, { isToday: true, avgActive: avg });
      setTargets(tc?.targets ?? null);
    })();
  }, [sb, id]);

  if (link === undefined) return <Skeleton className="h-64" />;

  if (!link) {
    return (
      <div className="mx-auto max-w-xl pt-6">
        <EmptyState icon="alert" title="Sem acesso a este cliente">
          A ligação não existe ou foi terminada.{" "}
          <Link href="/clientes" className="font-medium text-accent">
            Voltar aos clientes
          </Link>
        </EmptyState>
      </div>
    );
  }

  const name = link.outra_nome ?? link.outra_email ?? "Cliente";
  const logged = days.filter((d) => d.kcal != null);
  const avgKcal = logged.length ? Math.round(logged.reduce((s, d) => s + (d.kcal ?? 0), 0) / logged.length) : null;
  const deficitSum = logged.reduce((s, d) => s + (d.deficit ?? 0), 0);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/clientes" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <Icon name="chevronLeft" size={16} /> Clientes
        </Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
            <p className="text-sm text-muted">{link.outra_email}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {link.perm_dieta && <StatusBadge tone="accent">Plano alimentar</StatusBadge>}
            {link.perm_treino && <StatusBadge tone="accent">Treino</StatusBadge>}
            {link.perm_progresso && <StatusBadge tone="accent">Progresso</StatusBadge>}
          </div>
        </div>
      </div>

      <div className="flex rounded-xl border border-line bg-card p-1 text-sm sm:w-fit" role="tablist">
        {link.perm_dieta && (
          <button role="tab" aria-selected={tab === "plano"} onClick={() => setTab("plano")} className={`min-h-9 flex-1 rounded-lg px-4 font-medium ${tab === "plano" ? "bg-accent text-on-accent" : "text-muted"}`}>
            Plano alimentar
          </button>
        )}
        {link.perm_treino && (
          <button role="tab" aria-selected={tab === "treino"} onClick={() => setTab("treino")} className={`min-h-9 flex-1 rounded-lg px-4 font-medium ${tab === "treino" ? "bg-accent text-on-accent" : "text-muted"}`}>
            Treino
          </button>
        )}
        {link.perm_progresso && (
          <button role="tab" aria-selected={tab === "progresso"} onClick={() => setTab("progresso")} className={`min-h-9 flex-1 rounded-lg px-4 font-medium ${tab === "progresso" ? "bg-accent text-on-accent" : "text-muted"}`}>
            Progresso
          </button>
        )}
      </div>

      {tab === "plano" && link.perm_dieta && viewer && (
        <>
          {!link.perm_progresso && <p className="text-xs text-muted">Sem acesso ao progresso do cliente, por isso as metas do dia não são mostradas.</p>}
          <PlanEditor ownerId={id} viewerId={viewer} targets={targets} names={{ [id]: `${name} (cliente)` }} />
        </>
      )}

      {tab === "treino" && link.perm_treino && viewer && <WorkoutEditor ownerId={id} viewerId={viewer} names={{ [id]: `${name} (cliente)` }} />}

      {tab === "progresso" && link.perm_progresso && (
        <div className="space-y-5">
          <section className="tabular grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini label="Média ingerida (14 dias)" value={avgKcal != null ? `${avgKcal} kcal` : "–"} />
            <Mini label="Meta de ingestão hoje" value={targets ? `${targets.kcal} kcal` : "–"} />
            <Mini label="Défice acumulado (estim.)" value={logged.length ? `${deficitSum} kcal` : "–"} />
            <Mini label="Dias com registo" value={`${logged.length}/14`} />
          </section>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SectionCard title="Calorias: ingerido vs gasto (14 dias)">
              {days.length ? <CalorieChart days={days} weekly={false} /> : <Skeleton className="h-56" />}
            </SectionCard>
            <WeightChart weights={weights} goal={profile?.peso_meta_kg && Number(profile.peso_meta_kg) >= 40 ? Number(profile.peso_meta_kg) : null} />
          </div>
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
