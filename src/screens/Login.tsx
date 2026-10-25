import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { isFeatureEnabled } from "@/config/featureFlags";

const assetPathPrefix = "/assets";
const imgLogo = `${assetPathPrefix}/4cca0.svg`;

function authenticationErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code
      : undefined;

  switch (code) {
    case "auth/user-not-found":
    case "auth/invalid-credential":
      return "El email o la contraseña son incorrectos";
    case "auth/wrong-password":
      return "Contraseña incorrecta";
    case "auth/email-already-in-use":
      return "El email ya está registrado";
    case "auth/weak-password":
      return "La contraseña debe tener al menos 6 caracteres";
    case "auth/invalid-email":
      return "Email inválido";
    case "auth/operation-not-allowed":
      return "Este método de acceso no está habilitado. Contacta a tu administrador.";
    case "auth/unauthorized-domain":
      return "Este dominio no está autorizado para iniciar sesión. Contacta a tu administrador.";
    case "auth/popup-blocked":
      return "El navegador bloqueó la ventana de Google. Permite las ventanas emergentes e inténtalo otra vez.";
    case "auth/popup-closed-by-user":
      return "Se canceló el inicio de sesión con Google.";
    case "auth/network-request-failed":
    case "unavailable":
      return "No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.";
    case "permission-denied":
      return "No se pudo registrar tu solicitud de acceso. Inténtalo de nuevo o contacta a tu administrador.";
    default:
      return "No fue posible completar la autenticación. Inténtalo de nuevo.";
  }
}

export default function Login() {
  const {
    login,
    register,
    loginWithGoogle,
    user,
    profile,
    loading: authLoading,
    accessStatus,
    authError,
  } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [awaitingMembership, setAwaitingMembership] = useState(false);

  useEffect(() => {
    if (!awaitingMembership || authLoading || !user) return;

    if (accessStatus === "ACTIVE" && profile) {
      navigate("/", { replace: true });
      return;
    }

    if (accessStatus === "ERROR") {
      setError(authError?.message ?? "No se pudo verificar tu acceso al almacén.");
      setAwaitingMembership(false);
      return;
    }

    if (accessStatus === "INACTIVE") {
      navigate("/unauthorized", { replace: true, state: { reason: accessStatus } });
    }
  }, [accessStatus, authError, authLoading, awaitingMembership, navigate, profile, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === "login") {
        await login(email, password);
        setAwaitingMembership(true);
      } else {
        if (password !== confirmPassword) {
          setError("Las contraseñas no coinciden");
          setSubmitting(false);
          return;
        }
        if (!displayName.trim()) {
          setError("El nombre es requerido");
          setSubmitting(false);
          return;
        }
        await register(email, password, displayName);
        setAwaitingMembership(true);
      }
    } catch (err: unknown) {
      setError(authenticationErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await loginWithGoogle();
      setAwaitingMembership(true);
    } catch (err: unknown) {
      setError(authenticationErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-[#edf1f3] p-4">
      <div className="bg-white shadow-[0px_8px_24px_rgba(22,52,63,0.12)] rounded-[24px] w-full max-w-[420px] p-6 md:p-8">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <img src={imgLogo} alt="" className="size-10" />
          <span
            className="font-extrabold text-[#16343f] text-2xl"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
          >
            TarimaQR
          </span>
        </div>

        {/* Title */}
        <h1
          className="font-extrabold text-[#172126] text-[24px] text-center mb-2"
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
        >
          {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
        </h1>
        <p
          className="text-[#607078] text-center text-[14px] mb-8"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          {mode === "login" ? "Accede a tu almacén" : "Regístrate para empezar"}
        </p>

        {/* Error */}
        {error && (
          <div
            className="bg-[#fce9e7] border border-[#f5c6c2] rounded-[12px] px-4 py-3 mb-6 text-[13px] text-[#c0392b]"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label
                htmlFor="register-displayName"
                className="block text-[12px] font-bold text-[#607078] mb-1"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
              >
                Nombre completo
              </label>
              <input
                id="register-displayName"
                name="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Tu nombre"
                className="w-full px-4 py-3 border border-[#dce4e7] rounded-[12px] text-[14px] outline-none focus:border-[#3276a8] transition-colors"
                style={{ fontFamily: "'Inter', sans-serif" }}
                required
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="register-email"
              className="block text-[12px] font-bold text-[#607078] mb-1"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              Email
            </label>
            <input
              id="register-email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              className="w-full px-4 py-3 border border-[#dce4e7] rounded-[12px] text-[14px] outline-none focus:border-[#3276a8] transition-colors"
              style={{ fontFamily: "'Inter', sans-serif" }}
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label
              htmlFor="register-password"
              className="block text-[12px] font-bold text-[#607078] mb-1"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              Contraseña
            </label>
            <input
              id="register-password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 border border-[#dce4e7] rounded-[12px] text-[14px] outline-none focus:border-[#3276a8] transition-colors"
              style={{ fontFamily: "'Inter', sans-serif" }}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          {mode === "register" && (
            <div>
              <label
                htmlFor="register-confirmPassword"
                className="block text-[12px] font-bold text-[#607078] mb-1"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
              >
                Confirmar contraseña
              </label>
              <input
                id="register-confirmPassword"
                name="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 border border-[#dce4e7] rounded-[12px] text-[14px] outline-none focus:border-[#3276a8] transition-colors"
                style={{ fontFamily: "'Inter', sans-serif" }}
                required
                autoComplete="new-password"
              />
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || authLoading || awaitingMembership}
            className="w-full h-12 md:h-[52px] bg-[#16343f] hover:bg-[#1e4456] disabled:bg-[#b9c9cf] text-white font-bold text-[14px] md:text-[15px] rounded-[14px] transition-colors touch-target"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
          >
            {submitting || authLoading || awaitingMembership
              ? "Procesando..."
              : mode === "login"
                ? "Entrar"
                : "Registrarse"}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#dce4e7]" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span
              className="px-4 bg-white text-[#607078]"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              o continuar con
            </span>
          </div>
        </div>

        {/* Google Button */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={submitting || authLoading || awaitingMembership}
          className="w-full h-12 md:h-[52px] bg-white border border-[#dce4e7] hover:bg-[#f4f7f8] flex items-center justify-center gap-3 text-[14px] font-bold rounded-[14px] transition-colors touch-target"
          style={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 700,
            color: "#172126",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <span>Google</span>
        </button>

        {/* Switch mode */}
        <p
          className="text-center text-[13px] text-[#607078] mt-6"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          {mode === "login" ? "¿No tienes cuenta?" : "¿Ya tienes cuenta?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError(null);
            }}
            className="text-[#3276a8] font-bold underline"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            {mode === "login" ? "Regístrate" : "Inicia sesión"}
          </button>
        </p>

        {/* Feature flag notice */}
        {isFeatureEnabled("USE_FIRESTORE_RECEPCIONES") && (
          <div
            className="mt-6 p-3 bg-[#e8f2f7] border border-[#b6d4e7] rounded-[10px] text-center text-[11px] text-[#3276a8]"
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            🔥 Modo Firestore activo — datos sincronizados en tiempo real
          </div>
        )}
      </div>
    </div>
  );
}
