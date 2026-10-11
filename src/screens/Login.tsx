import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import { isFeatureEnabled } from "@/config/featureFlags"

const assetPathPrefix = "/assets"
const imgLogo = `${assetPathPrefix}/4cca0.svg`

export default function Login() {
  const { login, register, loginWithGoogle, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<"login" | "register">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      if (mode === "login") {
        await login(email, password)
        navigate("/", { replace: true })
      } else {
        if (password !== confirmPassword) {
          setError("Las contraseñas no coinciden")
          setSubmitting(false)
          return
        }
        if (!displayName.trim()) {
          setError("El nombre es requerido")
          setSubmitting(false)
          return
        }
        await register(email, password, displayName)
      }
    } catch (err: any) {
      const message =
        err.code === "auth/user-not-found"
          ? "Usuario no encontrado"
          : err.code === "auth/wrong-password"
            ? "Contraseña incorrecta"
            : err.code === "auth/email-already-in-use"
              ? "El email ya está registrado"
              : err.code === "auth/weak-password"
                ? "La contraseña debe tener al menos 6 caracteres"
                : err.code === "auth/invalid-email"
                  ? "Email inválido"
                  : "Error al autenticar"
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError(null)
    setSubmitting(true)
    try {
      await loginWithGoogle()
      navigate("/", { replace: true })
    } catch (err: any) {
      setError("Error al iniciar sesión con Google")
    } finally {
      setSubmitting(false)
    }
  }

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
                className="block text-[12px] font-bold text-[#607078] mb-1"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
              >
                Nombre completo
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Tu nombre"
                className="w-full px-4 py-3 border border-[#dce4e7] rounded-[12px] text-[14px] outline-none focus:border-[#3276a8] transition-colors"
                style={{ fontFamily: "'Inter', sans-serif" }}
                required
              />
            </div>
          )}

          <div>
            <label
              className="block text-[12px] font-bold text-[#607078] mb-1"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              className="w-full px-4 py-3 border border-[#dce4e7] rounded-[12px] text-[14px] outline-none focus:border-[#3276a8] transition-colors"
              style={{ fontFamily: "'Inter', sans-serif" }}
              required
            />
          </div>

          <div>
            <label
              className="block text-[12px] font-bold text-[#607078] mb-1"
              style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
            >
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 border border-[#dce4e7] rounded-[12px] text-[14px] outline-none focus:border-[#3276a8] transition-colors"
              style={{ fontFamily: "'Inter', sans-serif" }}
              required
              minLength={6}
            />
          </div>

          {mode === "register" && (
            <div>
              <label
                className="block text-[12px] font-bold text-[#607078] mb-1"
                style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
              >
                Confirmar contraseña
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 border border-[#dce4e7] rounded-[12px] text-[14px] outline-none focus:border-[#3276a8] transition-colors"
                style={{ fontFamily: "'Inter', sans-serif" }}
                required
              />
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || authLoading}
            className="w-full h-12 md:h-[52px] bg-[#16343f] hover:bg-[#1e4456] disabled:bg-[#b9c9cf] text-white font-bold text-[14px] md:text-[15px] rounded-[14px] transition-colors touch-target"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
          >
            {submitting || authLoading
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
          disabled={submitting || authLoading}
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
              setMode(mode === "login" ? "register" : "login")
              setError(null)
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
  )
}
