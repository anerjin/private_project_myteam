import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans_KR } from "next/font/google";
import { headers } from "next/headers";

import { ThemeProvider } from "@/components/layout/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SITE } from "@/config/site";
import "./globals.css";

const sans = Noto_Sans_KR({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: SITE.name, template: `%s · ${SITE.name}` },
  description: SITE.description,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  /*
   * **`next-themes` 는 인라인 스크립트를 심습니다** — 첫 페인트 전에 저장된
   * 테마를 적용해 흰 화면 깜빡임을 막는 용도입니다. CSP 아래에서는 그 한 줄이
   * 유일하게 막히는 스크립트였고, 막히면 **다크 모드가 매번 깜빡입니다.**
   *
   * nonce 는 `proxy.ts` 가 요청마다 새로 만들어 `x-nonce` 로 넘깁니다
   * (`NFR-SEC-014`). 여기서 읽어 그 스크립트에만 붙입니다.
   */
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="ko"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
