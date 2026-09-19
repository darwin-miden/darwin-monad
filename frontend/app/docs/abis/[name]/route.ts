import { ABIS } from "../../contracts";

export function generateStaticParams() {
  return ABIS.map(({ slug }) => ({ name: `${slug}.json` }));
}

export async function GET(_request: Request, ctx: RouteContext<"/docs/abis/[name]">) {
  const { name } = await ctx.params;
  const entry = ABIS.find(({ slug }) => `${slug}.json` === name);
  if (!entry) return Response.json({ error: "Unknown ABI" }, { status: 404 });
  return Response.json(entry.abi);
}
