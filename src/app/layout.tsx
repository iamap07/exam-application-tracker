import "./globals.css";
import { IBM_Plex_Sans } from "next/font/google";
const font = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });
export const metadata = { title: "Exam Application Tracker" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body className={`${font.className} min-h-screen bg-slate-50 text-slate-900 antialiased`}>{children}</body></html>);
}
