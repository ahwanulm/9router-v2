import React, { useState } from 'react';
import { Eye, EyeOff, ShieldAlert } from 'lucide-react';

// --- HELPER COMPONENTS (ICONS) ---

const GoogleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 48 48">
        <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s12-5.373 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z" />
        <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
        <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
        <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z" />
    </svg>
);


// --- TYPE DEFINITIONS ---

export interface Testimonial {
  avatarSrc: string;
  name: string;
  handle: string;
  text: string;
  link?: string;
}

interface SignInPageProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  heroImageSrc?: string;
  testimonials?: Testimonial[];
  password?: string;
  setPassword?: (val: string) => void;
  onSignIn?: (event: React.FormEvent<HTMLFormElement>) => void;
  onOidcSignIn?: () => void;
  onGoogleSignIn?: () => void;
  onResetPassword?: () => void;
  onCreateAccount?: () => void;
  oidcAvailable?: boolean;
  passwordAvailable?: boolean;
  oidcLoginLabel?: string;
  showOidcInfoMessage?: boolean;
  showBothInfoMessage?: boolean;
  error?: string;
  resetHint?: string;
  retryAfter?: number;
  loading?: boolean;
  hasPassword?: boolean;
}

// --- SUB-COMPONENTS ---

const GlassInputWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-black/5 dark:bg-white/5 backdrop-blur-sm transition-colors focus-within:border-violet-400/70 focus-within:bg-violet-500/10">
    {children}
  </div>
);

const TestimonialCard = ({ testimonial, delay }: { testimonial: Testimonial, delay: string }) => {
  const CardContent = (
    <>
      {testimonial.avatarSrc && (
        <img src={testimonial.avatarSrc} className="h-10 w-10 object-cover rounded-2xl shrink-0" alt="avatar" />
      )}
      <div className="text-sm leading-snug min-w-0">
        <p className="flex items-center gap-1 font-medium text-zinc-900 dark:text-zinc-100">{testimonial.name}</p>
        <p className="text-zinc-500 dark:text-zinc-400 truncate group-hover:text-violet-400 transition-colors">{testimonial.handle}</p>
        <p className="mt-1 text-zinc-800 dark:text-zinc-200">{testimonial.text}</p>
      </div>
    </>
  );

  const classes = `animate-testimonial ${delay} flex items-start gap-3 rounded-3xl bg-white/40 dark:bg-zinc-800/40 backdrop-blur-xl border border-white/10 p-5 w-64 text-left transition-all hover:scale-105 hover:bg-white/50 dark:hover:bg-zinc-850/50 group block`;

  if (testimonial.link) {
    return (
      <a href={testimonial.link} target="_blank" rel="noopener noreferrer" className={classes}>
        {CardContent}
      </a>
    );
  }

  return (
    <div className={classes}>
      {CardContent}
    </div>
  );
};

// --- MAIN COMPONENT ---

export const SignInPage: React.FC<SignInPageProps> = ({
  title = <span className="font-light text-zinc-900 dark:text-zinc-100 tracking-tighter">Welcome to 9Router</span>,
  description = "Enter your credentials to access the dashboard",
  heroImageSrc,
  testimonials = [],
  password = "",
  setPassword,
  onSignIn,
  onOidcSignIn,
  onGoogleSignIn,
  onResetPassword,
  onCreateAccount,
  oidcAvailable = false,
  passwordAvailable = true,
  oidcLoginLabel = "Sign in with OIDC",
  showOidcInfoMessage = false,
  showBothInfoMessage = false,
  error,
  resetHint,
  retryAfter = 0,
  loading = false,
  hasPassword = true,
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="h-[100dvh] flex flex-col md:flex-row font-sans w-[100dvw] overflow-hidden bg-white dark:bg-zinc-950">
      {/* Left column: sign-in form */}
      <section className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
        <div className="w-full max-w-md">
          <div className="flex flex-col gap-6">
            <h1 className="animate-element animate-delay-100 text-4xl md:text-5xl font-semibold leading-tight text-zinc-900 dark:text-zinc-50">{title}</h1>
            <p className="animate-element animate-delay-200 text-zinc-500 dark:text-zinc-400">{description}</p>

            {showOidcInfoMessage && (
              <div className="animate-element animate-delay-250 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex gap-2 items-start text-xs text-amber-700 dark:text-amber-300">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <p>OIDC login is enabled but issuer/client fields are not configured yet. Password login is still available for recovery.</p>
              </div>
            )}

            {showBothInfoMessage && (
              <div className="animate-element animate-delay-250 p-3 rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-900/50 text-xs text-violet-700 dark:text-violet-300 text-center">
                Password and OIDC login are both enabled.
              </div>
            )}

            {passwordAvailable && (
              <form className="space-y-5" onSubmit={onSignIn}>
                <div className="animate-element animate-delay-400">
                  <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Password</label>
                  <GlassInputWrapper>
                    <div className="relative">
                      <input
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter password"
                        value={password}
                        onChange={(e) => setPassword?.(e.target.value)}
                        required
                        autoFocus={!oidcAvailable}
                        className="w-full bg-transparent text-sm p-4 pr-12 rounded-2xl focus:outline-none text-zinc-900 dark:text-zinc-100"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-3 flex items-center">
                        {showPassword ? <EyeOff className="w-5 h-5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors" /> : <Eye className="w-5 h-5 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors" />}
                      </button>
                    </div>
                  </GlassInputWrapper>
                  {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
                  {retryAfter > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      Locked. Retry in <span className="font-mono">{retryAfter}s</span>.
                    </p>
                  )}
                  {resetHint && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
                      Forgot password? Open <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded font-mono">9router</code> CLI on the host → <b>Settings</b> → <b>Reset Password to Default</b>.
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || retryAfter > 0}
                  className="animate-element animate-delay-600 w-full rounded-2xl bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 py-4 font-medium text-zinc-50 dark:text-zinc-900 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {loading ? "Logging in..." : retryAfter > 0 ? `Wait ${retryAfter}s` : "Login"}
                </button>

                <div className="animate-element animate-delay-650 text-center space-y-1.5">
                  <p className="text-xs text-zinc-400">
                    Default password is <code className="bg-zinc-100 dark:bg-zinc-850 px-1 rounded font-mono">123456</code>
                  </p>
                  {hasPassword === false && (
                    <p className="text-xs text-zinc-500 italic">
                      No custom password is set yet. The default password above will work.
                    </p>
                  )}
                </div>
              </form>
            )}

            {(oidcAvailable || onGoogleSignIn) && (
              <>
                {passwordAvailable && (
                  <div className="animate-element animate-delay-700 relative flex items-center justify-center py-2">
                    <span className="w-full border-t border-zinc-200 dark:border-zinc-800"></span>
                    <span className="px-4 text-sm text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-950 absolute">Or continue with</span>
                  </div>
                )}

                <button
                  onClick={onOidcSignIn || onGoogleSignIn}
                  type="button"
                  className="animate-element animate-delay-800 w-full flex items-center justify-center gap-3 border border-zinc-200 dark:border-zinc-800 rounded-2xl py-4 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors text-zinc-850 dark:text-zinc-200 cursor-pointer"
                >
                  <GoogleIcon />
                  {oidcAvailable ? oidcLoginLabel : "Continue with Google"}
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Right column: hero image + testimonials */}
      {heroImageSrc && (
        <section className="hidden md:block flex-1 relative p-4 bg-zinc-50 dark:bg-zinc-900">
          <div className="animate-slide-right animate-delay-300 absolute inset-4 rounded-3xl bg-cover bg-center" style={{ backgroundImage: `url(${heroImageSrc})` }}></div>
          {testimonials.length > 0 && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 px-8 w-full justify-center">
              <TestimonialCard testimonial={testimonials[0]} delay="animate-delay-1000" />
              {testimonials[1] && <div className="hidden xl:flex"><TestimonialCard testimonial={testimonials[1]} delay="animate-delay-1200" /></div>}
              {testimonials[2] && <div className="hidden 2xl:flex"><TestimonialCard testimonial={testimonials[2]} delay="animate-delay-1400" /></div>}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
