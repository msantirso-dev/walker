import { requireUser, assertCan, ROLE_LABELS } from "@/modules/auth";
import { db } from "@/shared/db";
import { fmtShortTime } from "@/shared/dates";
import { Badge, PageHeader, Section } from "@/shared/ui";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { createUser, toggleUser, resetPassword } from "./actions";

export const dynamic = "force-dynamic";

export default async function Users({ searchParams }: { searchParams: Promise<{ club?: string }> }) {
  const u = await requireUser();
  assertCan(u, "clubs.manage");
  const { club } = await searchParams;
  const [users, clubs] = await Promise.all([
    db.user.findMany({ where: club ? { clubId: club } : {}, orderBy: [{ role: "asc" }, { name: "asc" }], include: { club: { select: { name: true } } } }),
    db.club.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader eyebrow="Accesos" title="Usuarios">
        Textil: administra todo. Producción: ve lotes sin datos personales. Club: gestiona su club. Entregas: registra retiros de su club.
      </PageHeader>
      <div className="card tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Club</th><th>Último ingreso</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {users.map((x) => (
              <tr key={x.id}>
                <td>{x.name}</td>
                <td className="text-sm">{x.email}</td>
                <td>{ROLE_LABELS[x.role]}</td>
                <td>{x.club?.name ?? "—"}</td>
                <td className="text-sm">{x.lastLoginAt ? fmtShortTime(x.lastLoginAt) : "Nunca"}</td>
                <td>{x.active ? <Badge tone="ok">Activo</Badge> : <Badge>Inactivo</Badge>}</td>
                <td>
                  {x.id !== u.id && (
                    <div className="flex flex-wrap gap-2">
                      <form action={toggleUser.bind(null, x.id)}><button className="btn btn-ghost btn-sm">{x.active ? "Desactivar" : "Activar"}</button></form>
                      <details>
                        <summary className="btn btn-ghost btn-sm">Contraseña</summary>
                        <ActionForm action={resetPassword.bind(null, x.id)} className="mt-2 grid gap-2">
                          <input name="password" type="password" minLength={10} className="input" placeholder="Nueva contraseña" aria-label="Nueva contraseña" autoComplete="new-password" />
                          <SubmitButton className="btn btn-primary btn-sm">Guardar</SubmitButton>
                        </ActionForm>
                      </details>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Section title="Nuevo usuario">
        <ActionForm action={createUser} className="card grid gap-4 p-5 md:grid-cols-2" resetOnOk>
          <div className="field"><label htmlFor="name">Nombre</label><input id="name" name="name" className="input" /></div>
          <div className="field"><label htmlFor="email">Correo</label><input id="email" name="email" type="email" className="input" autoComplete="off" /></div>
          <div className="field">
            <label htmlFor="role">Rol</label>
            <select id="role" name="role" className="input">{Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>
          <div className="field">
            <label htmlFor="clubId">Club</label>
            <select id="clubId" name="clubId" className="input" defaultValue={club ?? ""}>
              <option value="">Ninguno (textil)</option>
              {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="password">Contraseña inicial</label><input id="password" name="password" type="password" minLength={10} className="input" autoComplete="new-password" /><small>Mínimo 10 caracteres.</small></div>
          <SubmitButton className="btn btn-primary justify-self-start self-end">Crear usuario</SubmitButton>
        </ActionForm>
      </Section>
    </>
  );
}
