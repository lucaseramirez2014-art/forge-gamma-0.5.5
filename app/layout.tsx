import type { Metadata } from "next";
import "./globals.css";
import { ForgeProvider } from "../components/ForgeProvider";
import { MotionShell } from "../components/MotionShell";

export const metadata: Metadata = {
  title: "FORGE — Build momentum",
  description: "A focused productivity and skill-development app.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ForgeProvider><MotionShell>{children}</MotionShell></ForgeProvider>
      </body>
    </html>
  );
}
