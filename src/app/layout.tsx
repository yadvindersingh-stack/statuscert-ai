import type { Metadata } from "next";
import { Source_Sans_3, Spectral } from "next/font/google";
import "./globals.css";

const sans = Source_Sans_3({ subsets: ["latin"], variable: "--font-sans" });
const serif = Spectral({ subsets: ["latin"], variable: "--font-serif", weight: ["400", "600", "700"] });

export const metadata: Metadata = {
  title: "StatusCert AI",
  description: "Lawyer-grade status certificate reviews for Ontario real estate firms."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body className="font-sans">
        {children}
      </body>
    </html>
  );
}
