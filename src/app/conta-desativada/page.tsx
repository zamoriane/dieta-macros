import { EmptyState } from "@/components/ui/Primitives";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: `${t("desativada.titulo")} · Taking care of yourself` };
}

export default async function ContaDesativada() {
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-md pt-12">
      <EmptyState icon="alert" title={t("desativada.titulo")}>
        <p>{t("desativada.texto")}</p>
        <form action="/auth/signout" method="post" className="mt-4">
          <button className="btn btn-ghost">{t("nav.sair")}</button>
        </form>
      </EmptyState>
    </div>
  );
}
