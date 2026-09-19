import type { Metadata } from "next";
import { StockView } from "./StockView";

export async function generateMetadata({ params }: PageProps<"/stock/[symbol]">): Promise<Metadata> {
  const { symbol } = await params;
  return { title: decodeURIComponent(symbol).toUpperCase() };
}

export default async function StockPage({ params }: PageProps<"/stock/[symbol]">) {
  const { symbol } = await params;
  return <StockView symbol={decodeURIComponent(symbol).toUpperCase()} />;
}
