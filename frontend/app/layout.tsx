import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import { Nav } from "@/components/Nav";
import { Providers } from "./providers";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  weight: "variable",
});

export const metadata: Metadata = {
  title: { default: "Darwin", template: "%s · Darwin" },
  description: "Create and trade baskets of tokenized stocks on Monad.",
  applicationName: "Darwin",
  openGraph: {
    title: "Darwin",
    description: "Create and trade baskets of tokenized stocks on Monad.",
    siteName: "Darwin",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#eeede8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={instrumentSans.variable}>
      <body>
        <Providers>
          <Nav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
