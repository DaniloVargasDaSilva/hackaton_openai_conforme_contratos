import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Conforme",
  description: "Governança de contratos de licença de software com fornecedores de TI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
