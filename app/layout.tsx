import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vinted COO | Private Inventory Desk",
  description: "Cockpit privé de sourcing, d'arbitrage et de préparation des annonces Vinted.",
  applicationName: "Vinted COO",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Vinted COO" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined') {
                window.addEventListener('error', function(e) {
                  var filename = e.filename || '';
                  var message = e.message || '';
                  if (
                    filename.includes('webkit-masked-url') ||
                    filename.includes('safari-extension') ||
                    filename.includes('chrome-extension') ||
                    message.includes('tabs:outgoing.message') ||
                    message.includes('No Listener')
                  ) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                  }
                }, true);
                window.addEventListener('unhandledrejection', function(e) {
                  var reason = e.reason ? (e.reason.message || String(e.reason)) : '';
                  if (
                    reason.includes('tabs:outgoing.message') ||
                    reason.includes('No Listener') ||
                    reason.includes('webkit-masked-url')
                  ) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                  }
                }, true);
              }
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
