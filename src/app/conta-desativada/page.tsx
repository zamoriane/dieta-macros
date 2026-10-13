import { EmptyState } from "@/components/ui/Primitives";

export const metadata = { title: "Conta desativada · Dieta Macros" };

export default function ContaDesativada() {
  return (
    <div className="mx-auto max-w-md pt-12">
      <EmptyState icon="alert" title="Conta desativada">
        <p>A sua conta foi desativada pelo administrador. Os seus dados estão guardados e a conta pode ser reativada.</p>
        <form action="/auth/signout" method="post" className="mt-4">
          <button className="btn btn-ghost">Sair</button>
        </form>
      </EmptyState>
    </div>
  );
}
