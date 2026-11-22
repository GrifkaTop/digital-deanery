import type { Metadata } from "next";
import "./globals.css";
import { AccountShell } from "@/components/account";
export const metadata: Metadata = { title: "Цифровой деканат — конкурсный прототип", robots: { index: false, follow: false } };
export default function Layout({children}: Readonly<{children: React.ReactNode}>) { return <html lang="ru"><body><AccountShell>{children}</AccountShell></body></html>; }
