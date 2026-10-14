"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isoDay } from "@/lib/data";
import { lastValue, navyBodyFat, waistToHeight, whtrLevel, type MeasureKey, type Measurement, type Sex } from "@/lib/body";
import { getMeasurements, saveMeasurements } from "@/lib/measurements";
import { useI18n } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/core";
import { StatusBadge } from "@/components/ui/Primitives";
import { toast } from "@/components/ui/Toast";

const MAIN: MeasureKey[] = ["cintura", "anca", "pescoco"];
const EXTRA: MeasureKey[] = ["peito", "braco", "coxa"];
export const LEVEL_TONE = { saudavel: "good", aumentado: "warn", alto: "bad" } as const;

/** Registo das medidas de hoje (Perfil): último valor ao lado, cintura/altura e % de gordura estimada. */
export function MeasurementsCard({ uid, sex, heightCm }: { uid: string; sex: Sex | null; heightCm: number | null }) {
  const { t, df, nf } = useI18n();
  const sb = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Measurement[]>([]);
  const [vals, setVals] = useState<Partial<Record<MeasureKey, string>>>({});
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [missingTable, setMissingTable] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await getMeasurements(sb, uid));
    } catch (e) {
      if (/relation|does not exist|schema cache/i.test((e as Error).message)) setMissingTable(true);
    }
  }, [sb, uid]);

  useEffect(() => {
    load();
  }, [load]);

  const num = (s?: string) => (s == null || s.trim() === "" ? null : Number(s.replace(",", ".")));
  const parsed = Object.fromEntries(
    Object.entries(vals)
      .map(([k, v]) => [k, num(v)])
      .filter(([, v]) => v != null),
  ) as Partial<Record<MeasureKey, number>>;
  const invalid = Object.values(parsed).some((v) => !Number.isFinite(v) || v! < 10 || v! > 250);
  const canSave = Object.keys(parsed).length > 0 && !invalid;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    try {
      await saveMeasurements(sb, uid, isoDay(), parsed);
      setVals({});
      await load();
      toast(t("med.guardadas"));
    } catch (e) {
      toast((e as Error).message, { kind: "erro" });
    } finally {
      setBusy(false);
    }
  }

  // Indicadores com os valores mais recentes (os de hoje, se escritos, contam já)
  const cur = (k: MeasureKey) => parsed[k] ?? lastValue(rows, k)?.v ?? null;
  const waist = cur("cintura");
  const whtr = waist && heightCm ? waistToHeight(waist, heightCm) : null;
  const bf = sex && heightCm && waist && cur("pescoco") ? navyBodyFat(sex, heightCm, waist, cur("pescoco")!, cur("anca")) : null;

  const field = (k: MeasureKey) => {
    const last = lastValue(rows, k);
    return (
      <label key={k} className="block text-sm">
        <span className="text-muted">{t(`med.${k}` as MessageKey)} (cm)</span>
        <input
          inputMode="decimal"
          className="tabular mt-1 w-full"
          placeholder={last ? String(last.v).replace(".", ",") : ""}
          value={vals[k] ?? ""}
          onChange={(e) => setVals({ ...vals, [k]: e.target.value })}
        />
        <span className="text-xs text-muted">{last ? t("med.ultimo", { v: nf(last.v), data: df(last.dia, { day: "numeric", month: "short" }) }) : t("med.nenhum")}</span>
      </label>
    );
  };

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
      <div>
        <h2 className="font-medium">{t("med.titulo")}</h2>
        <p className="text-xs text-muted">{t("med.dica")}</p>
      </div>
      {missingTable ? (
        <p className="text-sm text-muted">{t("med.semTabela")}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">{MAIN.map(field)}</div>
          {more ? (
            <div className="grid grid-cols-3 gap-3">{EXTRA.map(field)}</div>
          ) : (
            <button className="text-xs font-medium text-accent" onClick={() => setMore(true)}>
              {t("med.mais")}
            </button>
          )}
          {invalid && <p className="text-xs text-bad">{t("med.invalido")}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button className="rounded-xl bg-accent px-4 py-2 text-on-accent disabled:opacity-50" disabled={!canSave || busy} onClick={save}>
              {busy ? t("comum.aGuardar") : t("med.registar")}
            </button>
            {whtr != null && (
              <span className="flex items-center gap-1.5 text-sm">
                {t("med.whtr")}: <strong className="tabular">{nf(whtr, 2)}</strong>
                <StatusBadge tone={LEVEL_TONE[whtrLevel(whtr)]}>{t(`med.nivel.${whtrLevel(whtr)}` as MessageKey)}</StatusBadge>
              </span>
            )}
            {bf != null && (
              <span className="text-sm">
                {t("med.gordura")}: <strong className="tabular">≈ {nf(bf)}%</strong>
              </span>
            )}
          </div>
          {!heightCm && <p className="text-xs text-muted">{t("med.precisaAltura")}</p>}
          {heightCm && waist && !bf && <p className="text-xs text-muted">{sex === "F" ? t("med.precisaF") : t("med.precisaM")}</p>}
        </>
      )}
    </section>
  );
}
