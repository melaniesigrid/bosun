import React, { useState } from "react";

import * as auth from "@/api/auth";

/**
 * Sign in.
 *
 * This is the development flow: an address that already belongs to a workspace
 * starts a session. The API refuses it unless BOSUN_DEV_LOGIN=1 and never in
 * production, because an endpoint that hands out a session for a known address
 * is an account takeover if it ever ships.
 *
 * The real flow is a magic link — issue #14.
 */
export default function Login() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.devLogin(email.trim());
      const next = new URLSearchParams(window.location.search).get("next");
      // A full load, so AuthContext re-checks the session it just received.
      window.location.assign(next || "/");
    } catch (err) {
      setError(
        err.status === 403
          ? "That address does not belong to a workspace yet."
          : err.status === 404
            ? "Sign-in is disabled. Start the API with BOSUN_DEV_LOGIN=1."
            : err.message || "Could not sign in.",
      );
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#ebe7e2", padding: 24,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "100%", maxWidth: 380, background: "#eeeae6", borderRadius: 20,
          padding: "34px 30px",
          boxShadow: "-8px -8px 16px rgba(255,250,244,0.78), 8px 8px 18px rgba(160,143,126,0.31)",
        }}
      >
        <h1
          style={{
            fontSize: 24, fontWeight: 600, color: "#3a3a3a",
            letterSpacing: "-0.02em", margin: "0 0 6px",
          }}
        >
          Bosun
        </h1>
        <p style={{ fontSize: 13.5, color: "#6e6e6e", margin: "0 0 22px", lineHeight: 1.5 }}>
          Sign in with the address that belongs to your workspace.
        </p>

        <label
          htmlFor="email"
          style={{
            display: "block", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
            textTransform: "uppercase", color: "#6e6e6e", marginBottom: 7,
          }}
        >
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          style={{
            width: "100%", padding: "11px 14px", borderRadius: 12, border: "none",
            background: "#ebe7e2", color: "#3a3a3a", fontSize: 14.5, outline: "none",
            boxShadow: "inset -3px -3px 6px rgba(255,250,244,0.68), inset 3px 3px 6px rgba(160,143,126,0.24)",
          }}
        />

        {error && (
          <p role="alert" style={{ fontSize: 13, color: "#c0392b", margin: "12px 0 0", lineHeight: 1.5 }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !email.trim()}
          style={{
            width: "100%", marginTop: 20, padding: "12px 16px", borderRadius: 12,
            border: "none", cursor: busy ? "default" : "pointer",
            background: "#ebe7e2", color: "#3a3a3a", fontSize: 14.5, fontWeight: 500,
            opacity: busy || !email.trim() ? 0.55 : 1,
            boxShadow: "-5px -5px 10px rgba(255,250,244,0.78), 5px 5px 12px rgba(160,143,126,0.27)",
          }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p style={{ fontSize: 12, color: "#8a837c", margin: "18px 0 0", lineHeight: 1.5 }}>
          Development sign-in. Magic links are issue #14.
        </p>
      </form>
    </div>
  );
}
