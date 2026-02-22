import { useEffect, useState } from "react";
import useAuth from "@/utils/useAuth";

export default function LogoutPage() {
  const { signOut } = useAuth();
  const [error, setError] = useState(null);

  useEffect(() => {
    const run = async () => {
      try {
        await signOut({ callbackUrl: "/", redirect: true });
      } catch (e) {
        console.error(e);
        setError("Could not sign out.");
      }
    };
    run();
  }, [signOut]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-[#F7EEFF] via-[#F2F7FF] to-[#FFF1F7] px-4 py-10">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-black/5 bg-white/80 p-6 text-center shadow-xl backdrop-blur">
        <div className="text-2xl font-extrabold text-[#111]">Signing out…</div>
        <div className="mt-2 text-sm font-semibold text-[#6B7280]">
          Please wait
        </div>
        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
