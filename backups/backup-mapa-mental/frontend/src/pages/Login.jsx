import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatApiErrorDetail } from "../lib/api";
import { Brain } from "@phosphor-icons/react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left decorative side */}
      <div className="hidden md:flex md:w-1/2 relative overflow-hidden border-r-2 border-black bg-[#FDE047] items-center justify-center">
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: "radial-gradient(#000 2px, transparent 2px)",
          backgroundSize: "28px 28px"
        }}/>
        <div className="relative z-10 max-w-md p-10">
          <div className="brutal-border brutal-shadow-lg bg-white rounded-2xl p-8 rotate-[-2deg]">
            <Brain size={48} weight="duotone" className="mb-4"/>
            <h1 className="text-4xl font-extrabold tracking-tight mb-2">Mapa Mental</h1>
            <p className="text-base text-gray-700">
              Crie mapas mentais ilimitados. Organize suas ideias com nós arrastáveis, cores e conexões.
            </p>
          </div>
          <div className="mt-6 flex gap-3 pl-6">
            <div className="brutal-border brutal-shadow bg-[#86EFAC] rounded-lg px-4 py-2 rotate-[3deg] font-bold">Ideias</div>
            <div className="brutal-border brutal-shadow bg-[#D8B4FE] rounded-lg px-4 py-2 rotate-[-4deg] font-bold">Conexões</div>
            <div className="brutal-border brutal-shadow bg-[#93C5FD] rounded-lg px-4 py-2 rotate-[2deg] font-bold">Fluxo</div>
          </div>
        </div>
      </div>

      {/* Form side */}
      <div className="w-full md:w-1/2 flex items-center justify-center p-6 bg-[#FDFBF7]">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="text-4xl font-extrabold tracking-tight">Entrar</h2>
            <p className="text-gray-600 mt-2">Acesse seus mapas mentais</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5" data-testid="login-form">
            <div>
              <label className="block text-sm font-bold mb-2">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="login-email-input"
                className="w-full brutal-border brutal-shadow-sm rounded-lg px-4 py-3 focus:outline-none focus:ring-4 focus:ring-[#FDE047]"
                placeholder="voce@exemplo.com"
              />
            </div>
            <div>
              <label className="block text-sm font-bold mb-2">Senha</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="login-password-input"
                className="w-full brutal-border brutal-shadow-sm rounded-lg px-4 py-3 focus:outline-none focus:ring-4 focus:ring-[#FDE047]"
                placeholder="••••••"
              />
            </div>
            {error && (
              <div data-testid="login-error" className="brutal-border rounded-lg bg-[#FCA5A5] px-4 py-2 text-sm font-bold">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              data-testid="login-submit-button"
              className="brutal-btn w-full bg-black text-white py-3"
            >
              {submitting ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <p className="mt-8 text-center text-sm">
            Não tem conta?{" "}
            <Link to="/register" data-testid="link-register" className="font-bold underline underline-offset-4">
              Criar Conta
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
