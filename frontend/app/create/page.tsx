import { CreateBasket } from "./CreateBasket";

export default async function CreatePage({ searchParams }: PageProps<"/create">) {
  const { asset } = await searchParams;
  return <CreateBasket initialAsset={typeof asset === "string" ? asset : undefined} />;
}
