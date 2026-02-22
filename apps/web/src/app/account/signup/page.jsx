import { useEffect, useMemo, useState } from "react";
import useAuth from "@/utils/useAuth";

export default function SignUpPage() {
  const { signUpWithCredentials } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const callbackUrl = useMemo(() => {
    if (typeof window === "undefined") return "/";
    const params = new URLSearchParams(window.location.search);
    return params.get("callbackUrl") || "/";
  }, []);

  useEffect(() => {
    setError(null);
  }, [email, password]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const emailTrimmed = String(email || "").trim();

    if (!emailTrimmed || !password) {
      setError("Please fill in all fields.");
      setLoading(false);
      return;
    }

    try {
      await signUpWithCredentials({
        email: emailTrimmed,
        password,
        callbackUrl,
        redirect: true,
      });
    } catch (err) {
      console.error(err);
      setError("Could not sign up. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#F7EEFF] via-[#F2F7FF] to-[#FFF1F7] px-4 py-10">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-black/5 bg-white/80 p-6 shadow-xl backdrop-blur">
        <div className="text-center">
          <div className="text-3xl font-extrabold text-[#111]">Wifey</div>
          <div className="mt-2 text-sm font-semibold text-[#6B7280]">
            Create your account
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
          <div>
            <label className="text-xs font-bold text-[#6B7280]">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoCapitalize="none"
              className="mt-2 w-full rounded-xl border border-black/10 bg-black/[0.03] px-4 py-3 text-base outline-none focus:border-[#7C3AED]"
              placeholder="you@email.com"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[#6B7280]">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="mt-2 w-full rounded-xl border border-black/10 bg-black/[0.03] px-4 py-3 text-base outline-none focus:border-[#7C3AED]"
              placeholder="••••••••"
            />
            <div className="mt-2 text-xs text-[#6B7280]">
              At least 6 characters
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-[#FF4FD8] to-[#7C3AED] px-4 py-3 text-base font-extrabold text-white disabled:opacity-60"
          >
            {loading ? "Creating…" : "Sign Up"}
          </button>

          <div className="text-center text-sm text-[#6B7280]">
            Already have an account?{" "}
            <a
              href={`/account/signin${typeof window !== "undefined" ? window.location.search : ""}`}
              className="font-extrabold text-[#7C3AED]"
            >
              Sign in
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
