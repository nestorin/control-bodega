import { Link } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"

const assetPathPrefix = "/assets"
const imgLogo = `${assetPathPrefix}/4cca0.svg`

export default function Unauthorized() {
  const { accessStatus } = useAuth()
  const message =
    accessStatus === "PENDING"
      ? "Tu cuenta está pendiente de aprobación. Contacta a tu supervisor o administrador."
      : accessStatus === "INACTIVE"
        ? "Tu cuenta está inactiva. Contacta a tu supervisor o administrador."
        : "No tienes permisos para acceder a esta sección. Contacta a tu supervisor o administrador."

  return (
    <div className="flex items-center justify-center h-screen bg-[#edf1f3] p-4">
      <div className="bg-white shadow-[0px_8px_24px_rgba(22,52,63,0.12)] rounded-[24px] w-full max-w-[420px] p-6 md:p-8 text-center">
        <img src={imgLogo} alt="" className="size-10 mx-auto mb-4" />
        <h1
          className="font-extrabold text-[#c54b45] text-2xl mb-2"
          style={{ fontFamily: "'Inter', sans-serif", fontWeight: 800 }}
        >
          Acceso denegado
        </h1>
        <p
          className="text-[#607078] text-[14px] mb-6"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          {message}
        </p>
        <div className="flex flex-col gap-3">
          <Link
            to="/"
            className="bg-[#16343f] hover:bg-[#1e4456] text-white font-bold h-12 md:h-[52px] px-5 rounded-[14px] transition-colors"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
          >
            Ir al inicio
          </Link>
          <Link
            to="/login"
            className="bg-white border border-[#dce4e7] hover:bg-[#f4f7f8] text-[#16343f] font-bold h-12 md:h-[52px] px-5 rounded-[14px] transition-colors"
            style={{ fontFamily: "'Inter', sans-serif", fontWeight: 700 }}
          >
            Cambiar de usuario
          </Link>
        </div>
      </div>
    </div>
  )
}
