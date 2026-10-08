import { SHEET_STATUS_LABEL } from "@/modules/clubsheet";
import { pesosInput } from "@/shared/money";
import { toArLocal } from "@/shared/dates";
import { ActionForm, SubmitButton } from "@/shared/ui/client";
import { saveSheetAction } from "./actions";

type Sheet = { status: string; balancePaid: number; paidAt: Date | null; method: string | null; reference: string | null; deliveredAt: Date | null; deliveredTo: string | null; notes: string | null } | null;

/** Formulario de la planilla del club para un pedido. */
export function SheetForm({ orderId, sheet, balance }: { orderId: string; sheet: Sheet; balance: number }) {
  const d = (v: Date | null | undefined) => (v ? toArLocal(v).slice(0, 10) : "");
  const k = orderId.slice(-6);
  return (
    <ActionForm action={saveSheetAction.bind(null, orderId)} className="grid gap-3 sm:grid-cols-3">
      <div className="field"><label htmlFor={`ss-${k}`}>Estado (planilla del club)</label>
        <select id={`ss-${k}`} name="status" className="input" defaultValue={sheet?.status ?? "PENDING"}>
          {Object.entries(SHEET_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="field"><label htmlFor={`sb-${k}`}>Saldo cobrado</label><input id={`sb-${k}`} name="balancePaid" className="input" inputMode="decimal" defaultValue={pesosInput(sheet?.balancePaid ?? 0)} placeholder={pesosInput(balance)} /></div>
      <div className="field"><label htmlFor={`sp-${k}`}>Fecha de cobro</label><input id={`sp-${k}`} name="paidAt" type="date" className="input" defaultValue={d(sheet?.paidAt)} /></div>
      <div className="field"><label htmlFor={`sm-${k}`}>Medio</label><input id={`sm-${k}`} name="method" className="input" defaultValue={sheet?.method ?? ""} placeholder="Efectivo, transferencia, cuotas…" /></div>
      <div className="field"><label htmlFor={`sr-${k}`}>Referencia</label><input id={`sr-${k}`} name="reference" className="input" defaultValue={sheet?.reference ?? ""} /></div>
      <div className="field"><label htmlFor={`sd-${k}`}>Retiró (nombre)</label><input id={`sd-${k}`} name="deliveredTo" className="input" defaultValue={sheet?.deliveredTo ?? ""} /></div>
      <div className="field"><label htmlFor={`se-${k}`}>Fecha de retiro</label><input id={`se-${k}`} name="deliveredAt" type="date" className="input" defaultValue={d(sheet?.deliveredAt)} /></div>
      <div className="field sm:col-span-2"><label htmlFor={`sn-${k}`}>Notas</label><input id={`sn-${k}`} name="notes" className="input" defaultValue={sheet?.notes ?? ""} /></div>
      <SubmitButton className="btn btn-primary btn-sm justify-self-start sm:col-span-3">Guardar en la planilla</SubmitButton>
    </ActionForm>
  );
}
