import React, { useState, useEffect } from "react";
import { useNavigate } from 'react-router-dom';
import { SignInPage, Testimonial } from "@/components/ui/sign-in";

const sampleTestimonials: Testimonial[] = [
  {
    avatarSrc: "",
    name: "Klipers AI",
    handle: "@klipers.pro",
    text: "Potong video YouTube jadi shorts viral otomatis pake AI. Tempel link, langsung jadi konten!",
    link: "https://klipers.pro"
  },
  {
    avatarSrc: "",
    name: "AMSTREAM",
    handle: "@amstream.pro",
    text: "Platform live streaming profesional. Multi-stream video ke YouTube, Facebook, Twitch secara bersamaan dengan satu klik.",
    link: "https://amstream.pro"
  },
  {
    avatarSrc: "",
    name: "Tutorials",
    handle: "@tutorial",
    text: "Read step-by-step guides on the Docs page to connect your AI models and manage proxies.",
    link: "/dashboard/docs"
  },
];

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resetHint, setResetHint] = useState("");
  const [retryAfter, setRetryAfter] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [authMode, setAuthMode] = useState("password");
  const [oidcConfigured, setOidcConfigured] = useState(false);
  const [oidcLoginLabel, setOidcLoginLabel] = useState("Sign in with OIDC");
  const navigate = useNavigate();

  // Countdown for rate-limit
  useEffect(() => {
    if (retryAfter <= 0) return;
    const id = setInterval(() => setRetryAfter((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [retryAfter]);

  useEffect(() => {
    async function checkAuth() {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

      try {
        const res = await fetch(`${baseUrl}/api/auth/status`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          
          const params = new URLSearchParams(window.location.search);
          const isForced = params.get("force") === "true" || params.get("force") === "1";

          if (data.requireLogin === false && !isForced) {
            // Fix: set this to preventRequireAuth redirection loop
            localStorage.setItem("9r_authed", "1");
            navigate("/dashboard");
            navigate(0);
            return;
          }
          setHasPassword(!!data.hasPassword);
          setAuthMode(data.authMode || "password");
          setOidcConfigured(data.oidcConfigured === true);
          setOidcLoginLabel(data.oidcLoginLabel || "Sign in with OIDC");
        } else {
          setHasPassword(true);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        setHasPassword(true);
      }
    }
    checkAuth();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResetHint("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        localStorage.setItem("9r_authed", "1");
        navigate("/dashboard");
        navigate(0);
      } else {
        const data = await res.json();
        setError(data.error || "Invalid password");
        if (data.resetHint) setResetHint(data.resetHint);
        if (data.retryAfter) setRetryAfter(Number(data.retryAfter));
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOidcLogin = () => {
    window.location.href = "/api/auth/oidc/start";
  };

  const oidcAvailable = oidcConfigured && ["oidc", "both"].includes(authMode);
  const passwordAvailable = authMode !== "oidc" || !oidcConfigured;

  // Show loading state while checking password status
  if (hasPassword === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900 dark:border-zinc-50"></div>
          <p className="text-zinc-500 dark:text-zinc-400 mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  const showOidcInfoMessage = ((authMode === "oidc" && !oidcConfigured) || (authMode === "both" && !oidcConfigured));
  const showBothInfoMessage = (authMode === "both" && oidcConfigured);

  return (
    <SignInPage
      title={
        <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          9Router <span className="font-light text-zinc-400">v2</span>
        </span>
      }
      description={
        authMode === "oidc" && oidcConfigured
          ? "Sign in with your OIDC provider to access the dashboard"
          : "Enter your dashboard password to continue"
      }
      heroImageSrc="https://images.unsplash.com/photo-1642615835477-d303d7dc9ee9?w=2160&q=80"
      testimonials={sampleTestimonials}
      password={password}
      setPassword={setPassword}
      onSignIn={handleLogin}
      onOidcSignIn={handleOidcLogin}
      oidcAvailable={oidcAvailable}
      passwordAvailable={passwordAvailable}
      oidcLoginLabel={oidcLoginLabel}
      showOidcInfoMessage={showOidcInfoMessage}
      showBothInfoMessage={showBothInfoMessage}
      error={error}
      resetHint={resetHint}
      retryAfter={retryAfter}
      loading={loading}
      hasPassword={hasPassword}
    />
  );
}
