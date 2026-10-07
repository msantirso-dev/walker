import { readStored } from "@/modules/storage";

const TYPES: Record<string, string> = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!path.every((p) => /^[a-zA-Z0-9_.-]+$/.test(p) && p !== ".." && p !== ".")) return new Response("No encontrado", { status: 404 });
  const ext = path.at(-1)!.split(".").pop()!.toLowerCase();
  const type = TYPES[ext];
  if (!type) return new Response("No encontrado", { status: 404 });
  const data = await readStored(["public", ...path].join("/"));
  if (!data) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
