import { ABIS, abiCounts, abiPath } from "../contracts";

export function GET() {
  return Response.json({
    contracts: ABIS.map(({ slug, name, abi }) => ({ name, path: abiPath(slug), ...abiCounts(abi) })),
  });
}
