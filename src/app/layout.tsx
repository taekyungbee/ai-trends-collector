import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Trends Collector",
  description: "AI Trends 수집/요약/발송 백엔드 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
