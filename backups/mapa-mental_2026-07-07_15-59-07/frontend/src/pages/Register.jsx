import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatApiErrorDetail } from "../lib/api";
import { Brain } from "@phosphor-icons/react";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await register(name, email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="hidden md:flex md:w-1/2 relative overflow-hidden border-r-2 border-black bg-[#86EFAC] items-center justify-center">
        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: "radial-gradient(#000 2px, transparent 2px)",
          backgroundSize: "28px 28px"
        }}/>
        <div className="relative z-10 max-w-md p-10">
          <div className="brutal-border brutal-shadow-lg bg-white rounded-2xl p-8 rotate-[2deg]">
            <Brain size={48} weight="duotone" className="mb-4"/>
            <h1 className="text-4xl font-extrabold tracking-tight mb-2">Bem-vindo</h1>
            <p className="text-base text-gray-700">
              Crie sua conta e comece a mapear suas ideias em segundos.
            </p>
          </div>
        </div>
      </div>

      <div className="w-full md:w-1/2 flex items-center justify-center p-6 bg-[#FDFBF7]">
        <div className="w-full max-w-md">
          <h2 className="text-4xl font-extrabold tracking-tight mb-2">Criar Conta</h2>
          <p className="text-gray-600 mb-8">É rápido e grátis.</p>

          <form onSubmit={onSubmit} className="space-y-5" data-testid="register-form">
            <div>
              <label className="block text-sm font-bold mb-2">Nome</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="register-name-input"
                className="w-full brutal-border brutal-shadow-sm rounded-lg px-4 py-3 focus:outline-none focus:ring-4 focus:ring-[#FDE047]"
                placeholder="Seu nome"
              />
            </div>
            <div>
              <label className="block text-sm font-bold mb-2">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="register-email-input"
                className="w-full brutal-border brutal-shadow-sm rounded-lg px-4 py-3 focus:outline-none focus:ring-4 focus:ring-[#FDE047]"
              />
            </div>
            <div>
              <label className="block text-sm font-bold mb-2">Senha</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="register-password-input"
                className="w-full brutal-border brutal-shadow-sm rounded-lg px-4 py-3 focus:outline-none focus:ring-4 focus:ring-[#FDE047]"
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            {error && (
              <div data-testid="register-error" className="brutal-border rounded-lg bg-[#FCA5A5] px-4 py-2 text-sm font-bold">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              data-testid="register-submit-button"
              className="brutal-btn w-full bg-black text-white py-3"
            >
              {submitting ? "Criando conta..." : "Criar Conta"}
            </button>
          </form>

          <p className="mt-8 text-center text-sm">
            Já tem conta?{" "}
            <Link to="/login" data-testid="link-login" className="font-bold underline underline-offset-4">
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
