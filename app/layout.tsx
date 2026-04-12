import "./globals.css";
import { StoreProvider } from "@/lib/store";
import Nav from "@/components/nav";
import ToastAndConfirm from "@/components/toast-confirm";

export const metadata = {
  title: "Demo to Conversion Platform",
  description: "AI Virtual Workforce Platform — Track, evaluate, and convert demo sessions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>
          <Nav />
          <ToastAndConfirm />
          {children}
        </StoreProvider>
      </body>
    </html>
  );
}
