"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { NEAR_BLACK, MUTED } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div style={{ maxWidth: 400, width: "100%" }}>
        <p
          className="section-label"
          style={{ textAlign: "center", marginBottom: 8 }}
        >
          Demo to Conversion
        </p>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            color: NEAR_BLACK,
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          Sign in.
        </h1>
        <p
          style={{
            fontSize: 15,
            color: MUTED,
            textAlign: "center",
            marginBottom: 32,
            lineHeight: 1.47,
          }}
        >
          Use your work email to continue.
        </p>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input
            type="email"
            required
            placeholder="Email"
            className={"apple-input" + (error ? " error" : "")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            disabled={loading}
          />
          <input
            type="password"
            required
            placeholder="Password"
            className={"apple-input" + (error ? " error" : "")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={loading}
          />
          <button
            type="submit"
            className="pill pill-blue"
            style={{
              marginTop: 8,
              padding: "12px 20px",
              fontSize: 14,
              fontWeight: 500,
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {error && (
          <p
            style={{
              color: "#E24B4A",
              fontSize: 13,
              marginTop: 14,
              textAlign: "center",
              lineHeight: 1.47,
            }}
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
