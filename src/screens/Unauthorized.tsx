import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { ORGANIZATION_ID } from "@/config/organization";

const assetPathPrefix = "/assets";
const imgLogo = `${assetPathPrefix}/4cca0.svg`;

function messageFor(reason: string | undefined, accessStatus: string): string {
  switch (reason ?? accessStatus) {
    case "INACTIVE":
      return "Tu cuenta está inactiva. Contacta a tu supervisor o administrador.";
    case "ERROR":
      return "No se pudieron verificar tus permisos. Revisa el detalle técnico o contacta a soporte.";
    case "role":
      return "Tu rol no tiene permiso para abrir esta sección. Contacta a tu supervisor o administrador.";
    case "warehouse":
      return "Tu almacén asignado no incluye esta sección. Contacta a tu supervisor o administrador.";
    default:
      return "No tienes permisos para acceder a esta sección. Contacta a tu supervisor o administrador.";
  }
}

export default function Unauthorized() {
  const location = useLocation();
  const { user, accessStatus, authError } = useAuth();
  const [copied, setCopied] = useState(false);

  const state = location.state as { reason?: string } | null;
  const cause = state?.reason ?? accessStatus;
  const message = messageFor(state?.reason, accessStatus);
  const detail = cause === "ERROR" ? authError?.message : null;
  const accessRef = user?.uid != null ? `organizations/${ORGANIZATION_ID}/users/${user.uid}` : null;

  const copyAccessRef = async () => {
    if (!accessRef || typeof navigator.clipboard?.writeText !== "function") return;
    await navigator.clipboard.writeText(accessRef);
    setCopied(true);
  };

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
          className="text-[#607078] text-[14px] mb-4"
          style={{ fontFamily: "'Inter', sans-serif" }}
        >
          {message}
        </p>

        {detail && (
          <p
            role="alert"
            className="text-[#c54b45] text-[12px] break-words mb-4 font-mono"
            data-testid="auth-error-detail"
          >
            {detail}
          </p>
        )}

        {accessRef && cause === "ERROR" && (
          <div className="bg-[#f4f7f8] border border-[#dce4e7] rounded-[12px] p-3 mb-6 text-left">
            <p
              className="text-[#607078] text-[11px] uppercase font-bold mb-2"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              Referencia de acceso
            </p>
            <code
              className="block text-[12px] text-[#16343f] break-all mb-2"
              data-testid="access-ref"
            >
              {accessRef}
            </code>
            <button
              type="button"
              onClick={copyAccessRef}
              className="text-[#16343f] text-[12px] font-bold underline hover:no-underline"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              {copied ? "Copiado ✓" : "Copiar referencia"}
            </button>
          </div>
        )}

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
  );
}
