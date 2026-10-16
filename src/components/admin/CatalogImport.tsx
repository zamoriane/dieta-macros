"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SectionCard, Skeleton, StatusBadge } from "@/components/ui/Primitives";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { Icon } from "@/components/ui/Icon";
import { toast } from "@/components/ui/Toast";
import { useI18n } from "@/lib/i18n/client";

type Fonte = { source: "insa" | "taco"; ativos: number; inativos: number; versao: string | null };
type Hist = { id: number; fonte: string; versao: string; ficheiro: string | null; total: number; novos: number; alterados: number; inativados: number; reativados: number; ignorados: number; em: string };
type Change = { external_id: number; name: string; campos: { campo: string; antes: string | number | null; depois: string | number | null }[] };
type Previa = {
  source: "insa" | "taco";
  versao: string;
  versaoDetetada: string;
  notas: string[];
  ignorados: { linha: number; nome: string; motivo: string }[];
  planosAfetados: number;
  total: number;
  novos: number;
  alterados: number;
  iguais: number;
  inativados: number;
  reativados: number;
  exemplosNovos: string[];
  exemplosAlterados: Change[];
  exemplosInativados: string[];
};

const NOME: Record<string, string> = { insa: "INSA (Portugal)", taco: "TACO (Brasil)" };
const CAMPO: Record<string, string> = {
  name: "nome",
  grupo: "grupo",
  unidade: "unidade",
  kcal_100g: "kcal",
  protein_100g: "P",
  carbs_100g: "H",
  fat_100g: "G",
  fiber_100g: "fibra",
  sugar_100g: "açúcares",
};

/** Importação das tabelas oficiais (INSA / TACO) a partir do Excel: pré-visualizar → confirmar. */
export function CatalogImport() {
  const { t, df, nf } = useI18n();
  const fmt = (s: string) => df(new Date(s), { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const [fontes, setFontes] = useState<Fonte[] | null>(null);
  const [hist, setHist] = useState<Hist[]>([]);
  const [semMigracao, setSemMigracao] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [versao, setVersao] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState<"previa" | "importar" | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/catalog");
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSemMigracao(!!j.migracao);
      setFontes([]);
      return;
    }
    setFontes(j.fontes ?? []);
    setHist(j.historico ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function send(modo: "previa" | "importar") {
    if (!file) return;
    setBusy(modo);
    setErro(null);
    try {
      const fd = new FormData();
      fd.set("ficheiro", file);
      fd.set("modo", modo);
      if (versao.trim()) fd.set("versao", versao.trim());
      const res = await fetch("/api/admin/catalog", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      if (!res.ok) {
        setErro(j.error ?? `HTTP ${res.status}`);
        if (modo === "previa") setPrevia(null);
        return;
      }
      if (modo === "previa") {
        setPrevia(j as Previa);
        if (!versao.trim()) setVersao((j as Previa).versao);
      } else {
        toast(t("cat.importado", { n: j.resultado?.total ?? 0, fonte: NOME[j.source] ?? j.source }));
        setPrevia(null);
        setFile(null);
        setVersao("");
        if (input.current) input.current.value = "";
        setConfirmar(false);
        load();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <SectionCard title={t("cat.titulo")}>
      <p className="text-sm text-muted">{t("cat.explica")}</p>

      {fontes === null ? (
        <Skeleton className="mt-4 h-16" />
      ) : semMigracao ? (
        <p className="mt-4 rounded-lg bg-warn-soft p-3 text-sm">{t("cat.semMigracao")}</p>
      ) : (
        <div className="tabular mt-4 grid gap-3 sm:grid-cols-2">
          {fontes.map((f) => (
            <div key={f.source} className="rounded-xl bg-card-2 p-3">
              <div className="text-xs text-muted">{NOME[f.source]}</div>
              <div className="mt-0.5 text-lg font-semibold">{f.ativos ? t("cat.nAlimentos", { n: nf(f.ativos) }) : t("cat.vazio")}</div>
              <div className="text-xs text-muted">
                {f.versao ? t("cat.versao", { v: f.versao }) : "–"}
                {f.inativos ? ` · ${t("cat.nInativos", { n: f.inativos })}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="text-sm font-medium">{t("cat.ficheiro")}</span>
          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="mt-1 block w-full text-sm"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPrevia(null);
              setErro(null);
              setVersao("");
            }}
          />
          <span className="mt-1 block text-xs text-muted">{t("cat.ficheiroDica")}</span>
        </label>
        <button className="btn btn-ghost w-full sm:w-auto" disabled={!file || !!busy} onClick={() => send("previa")}>
          <Icon name="search" size={18} /> {busy === "previa" ? t("cat.aAnalisar") : t("cat.analisar")}
        </button>
        {erro && <p className="rounded-lg bg-bad-soft p-3 text-sm text-bad">{erro}</p>}
      </div>

      {previa && (
        <div className="mt-5 space-y-4 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="accent">{NOME[previa.source]}</StatusBadge>
            {previa.notas.map((n) => (
              <span key={n} className="text-xs text-muted">{n}</span>
            ))}
          </div>
          <label className="block max-w-xs">
            <span className="text-sm font-medium">{t("cat.versaoCampo")}</span>
            <input className="mt-1 w-full" value={versao} onChange={(e) => setVersao(e.target.value)} maxLength={40} />
          </label>

          <div className="tabular grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
            <Num label={t("cat.total")} v={previa.total} />
            <Num label={t("cat.novos")} v={previa.novos} tone={previa.novos ? "good" : undefined} />
            <Num label={t("cat.alterados")} v={previa.alterados} tone={previa.alterados ? "warn" : undefined} />
            <Num label={t("cat.iguais")} v={previa.iguais} />
            <Num label={t("cat.inativados")} v={previa.inativados} tone={previa.inativados ? "bad" : undefined} />
          </div>
          {previa.reativados > 0 && <p className="text-sm">{t("cat.reativados", { n: previa.reativados })}</p>}
          {previa.planosAfetados > 0 && <p className="rounded-lg bg-warn-soft p-3 text-sm">{t("cat.planos", { n: previa.planosAfetados })}</p>}

          {previa.exemplosNovos.length > 0 && <Lista titulo={t("cat.exNovos")} itens={previa.exemplosNovos} mais={previa.novos - previa.exemplosNovos.length} />}
          {previa.exemplosAlterados.length > 0 && (
            <Lista
              titulo={t("cat.exAlterados")}
              itens={previa.exemplosAlterados.map((c) => `${c.name}: ${c.campos.map((x) => `${CAMPO[x.campo] ?? x.campo} ${x.antes ?? "–"} → ${x.depois ?? "–"}`).join(", ")}`)}
              mais={previa.alterados - previa.exemplosAlterados.length}
            />
          )}
          {previa.exemplosInativados.length > 0 && <Lista titulo={t("cat.exInativados")} itens={previa.exemplosInativados} mais={previa.inativados - previa.exemplosInativados.length} />}
          {previa.ignorados.length > 0 && (
            <Lista titulo={t("cat.exIgnorados", { n: previa.ignorados.length })} itens={previa.ignorados.slice(0, 10).map((i) => `${t("cat.linha", { n: i.linha })} · ${i.nome}: ${i.motivo}`)} mais={previa.ignorados.length - 10} />
          )}

          <button className="btn btn-primary w-full sm:w-auto" disabled={!!busy || !versao.trim()} onClick={() => setConfirmar(true)}>
            <Icon name="check" size={18} /> {t("cat.importar")}
          </button>
        </div>
      )}

      {hist.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="mb-2 text-sm font-semibold">{t("cat.historico")}</h3>
          <ul className="space-y-2 text-sm">
            {hist.map((h) => (
              <li key={h.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  <span className="font-medium">{NOME[h.fonte] ?? h.fonte}</span> {h.versao} ·{" "}
                  {t("cat.histLinha", { total: h.total, novos: h.novos, alterados: h.alterados, inativados: h.inativados })}
                  {h.ignorados ? ` · ${t("cat.histIgnorados", { n: h.ignorados })}` : ""}
                </span>
                <span className="text-xs text-muted">{fmt(h.em)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ResponsiveDialog
        open={confirmar && !!previa}
        title={t("cat.confirmarTitulo")}
        onClose={() => setConfirmar(false)}
        footer={
          <>
            <button className="btn btn-ghost flex-1" onClick={() => setConfirmar(false)}>
              {t("comum.cancelar")}
            </button>
            <button className="btn btn-primary flex-1" disabled={!!busy} onClick={() => send("importar")}>
              {busy === "importar" ? t("cat.aImportar") : t("comum.confirmar")}
            </button>
          </>
        }
      >
        {previa && (
          <p className="text-sm">
            {t("cat.confirmarTexto", { fonte: NOME[previa.source], v: versao, novos: previa.novos, alterados: previa.alterados, inativados: previa.inativados })}
          </p>
        )}
      </ResponsiveDialog>
    </SectionCard>
  );
}

function Num({ label, v, tone }: { label: string; v: number; tone?: "good" | "warn" | "bad" }) {
  const c = tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink";
  return (
    <div className="rounded-xl bg-card-2 py-2.5">
      <div className={`text-base font-semibold ${c}`}>{v}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}

function Lista({ titulo, itens, mais }: { titulo: string; itens: string[]; mais: number }) {
  const { t } = useI18n();
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{titulo}</h4>
      <ul className="space-y-0.5 text-sm">
        {itens.map((x, i) => (
          <li key={i} className="break-words">
            {x}
          </li>
        ))}
        {mais > 0 && <li className="text-xs text-muted">{t("cat.eMais", { n: mais })}</li>}
      </ul>
    </div>
  );
}
