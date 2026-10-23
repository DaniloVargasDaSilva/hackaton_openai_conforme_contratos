import type { Metadata } from "next";
import { Geist, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Fonte da interface e dos números: trocar aqui (ex.: IBM_Plex_Sans, Manrope, Public_Sans) muda o app inteiro.
const interfaceFont = Geist({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-interface" });
// Serifada só nos documentos (contrato, NF, relatório).
const sourceSerif = Source_Serif_4({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-source-serif" });

export const metadata: Metadata = {
  title: "Conforme",
  description: "Governança de contratos de licença de software com fornecedores de TI",
  icons: { icon: "/brand/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${interfaceFont.variable} ${sourceSerif.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
