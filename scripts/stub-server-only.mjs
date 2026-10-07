// Permite ejecutar módulos del servidor fuera de Next (scripts de verificación): "server-only" pasa a ser un módulo vacío.
import { register } from "node:module";
register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(s, c, n) { if (s === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true }; return n(s, c); }`),
);
