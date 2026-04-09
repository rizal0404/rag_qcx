import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TechDoc AI — Technical Documentation Assistant",
  description:
    "AI-powered chatbot for querying industrial equipment technical manuals. Get accurate answers with citations from your knowledge base.",
  keywords: ["RAG", "chatbot", "technical documentation", "knowledge base", "AI assistant"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
