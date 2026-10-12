import type { Metadata, Viewport } from "next";
import { Golos_Text, Unbounded } from "next/font/google";
import "./globals.css";

const unbounded = Unbounded({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
  variable: "--font-unbounded",
  display: "swap",
});

const golos = Golos_Text({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
  variable: "--font-golos",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Barber Time — барбершоп в Ташкенте",
  description:
    "Мужские стрижки, фейды и бритьё опасной бритвой в центре Ташкента. Онлайн-запись к мастеру за минуту.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef2f1" },
    { media: "(prefers-color-scheme: dark)", color: "#141c25" },
  ],
};

const headScript = `(function(){var d=document.documentElement;try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}d.dataset.theme=t}catch(e){}try{if(!matchMedia("(prefers-reduced-motion: reduce)").matches){d.dataset.intro="run";setTimeout(function(){delete d.dataset.intro},2500)}}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={`${unbounded.variable} ${golos.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: headScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
