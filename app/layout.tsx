import type { ReactNode } from "react";
import { ExperienceProvider } from "@/components/ExperienceProvider";
import "./globals.css";

export const metadata = {
  title: "Taste Time Machine",
  description: "A calm companion for rediscovering the world someone grew up in.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="absolute left-5 top-[-44px] z-20 rounded-lg bg-[#172433] px-[14px] py-2 text-white focus:top-[18px]" href="#main">
          Skip to content
        </a>
        <ExperienceProvider>{children}</ExperienceProvider>
      </body>
    </html>
  );
}
