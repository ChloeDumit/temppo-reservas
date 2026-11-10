"use client";

import { deleteCouponAction } from "./actions";

/** «Eliminar», after asking. */
export function ConfirmDelete({ id, code }: { id: string; code: string }) {
  return (
    <form
      action={deleteCouponAction}
      onSubmit={(e) => {
        if (!window.confirm(`¿Eliminar el cupón ${code}? Deja de funcionar enseguida. Las reservas y compras que ya lo usaron no cambian.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="text-xs font-medium text-critical underline-offset-4 hover:underline">Eliminar</button>
    </form>
  );
}
