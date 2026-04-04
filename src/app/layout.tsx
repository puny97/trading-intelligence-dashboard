import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NSE · BSE Volume Buzzer — Live Tracker",
  description: "Real-time NSE & BSE Volume Spurt and Rapid Mover Scanner",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* Global nav — link to Magic Dashboard */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "6px 20px",
            background: "#030a0e",
            borderBottom: "1px solid #0e2a35",
            fontSize: 9,
            letterSpacing: 2,
          }}
        >
          <a
            href="/magic"
            style={{
              color: "#00ffe7",
              textDecoration: "none",
              padding: "4px 12px",
              border: "1px solid rgba(0,255,231,0.3)",
              borderRadius: 3,
              background: "rgba(0,255,231,0.06)",
            }}
          >
            🪄 MAGIC DASHBOARD →
          </a>
        </div>
        {children}
      </body>
    </html>
  );
}
