import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Daily AI Bot",
  description: "Plan your day, track habits, and journal with an AI copilot",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="app-header">
            <div className="brand">Daily AI Bot</div>
          </header>
          <main className="app-main">{children}</main>
          <footer className="app-footer">Made for your daily flow</footer>
        </div>
      </body>
    </html>
  );
}
