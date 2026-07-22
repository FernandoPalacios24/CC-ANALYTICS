import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "CC Analytics | Cable Color", description: "Plataforma empresarial de Business Intelligence" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
