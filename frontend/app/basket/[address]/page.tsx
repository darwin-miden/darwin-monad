import { BasketView } from "@/components/basket/BasketView";

export default async function BasketPage({ params, searchParams }: PageProps<"/basket/[address]">) {
  const { address } = await params;
  const { mode } = await searchParams;
  return <BasketView address={address} mode={typeof mode === "string" ? mode : undefined} />;
}
