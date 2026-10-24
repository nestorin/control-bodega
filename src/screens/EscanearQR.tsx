import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

interface Props {
  onFound: (id: string) => void;
  onClose: () => void;
}

export default function EscanearQR({ onFound, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const onFoundRef = useRef(onFound);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  const [manualId, setManualId] = useState("");

  useEffect(() => { onFoundRef.current = onFound; }, [onFound]);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    let active = true;
    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      setError("La cámara requiere una conexión segura (HTTPS). Abre la aplicación con HTTPS.");
      return () => { active = false; (reader as any).reset?.(); };
    }
    if (!navigator.mediaDevices?.getUserMedia || !videoRef.current) {
      setError("Este navegador no permite acceder a la cámara. Prueba con Chrome o Safari actualizado.");
      return () => { active = false; (reader as any).reset?.(); };
    }
    reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (result) {
          setScanning(false);
          onFoundRef.current(result.getText());
        }
      })
      .then((controls) => {
        if (!active) { controls.stop(); return; }
        controlsRef.current = controls;
        if (videoRef.current) {
          videoRef.current.muted = true;
          videoRef.current.playsInline = true;
          void videoRef.current.play().catch(() => undefined);
        }
      })
      .catch((cause: unknown) => {
        const cameraError = cause as { name?: string };
        setError(cameraError.name === "NotAllowedError" || cameraError.name === "PermissionDeniedError"
          ? "El permiso de cámara está bloqueado. Habilítalo en los ajustes del sitio y vuelve a intentar."
          : cameraError.name === "NotFoundError" || cameraError.name === "DevicesNotFoundError"
            ? "No se encontró una cámara disponible en este dispositivo."
            : cameraError.name === "NotReadableError" || cameraError.name === "TrackStartError"
              ? "La cámara está siendo usada por otra aplicación. Ciérrala e inténtalo de nuevo."
              : "No se pudo iniciar la cámara. Revisa los permisos del navegador e inténtalo de nuevo.");
      });

    return () => {
      active = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
      (reader as any).reset?.();
    };
  }, []);

  function handleManual(e: React.FormEvent) {
    e.preventDefault();
    if (manualId.trim()) onFound(manualId.trim().toUpperCase());
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "28px",
        padding: "40px 28px",
        height: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: "22px",
            fontWeight: 800,
            color: "#172126",
            margin: 0,
          }}
        >
          Escanear código QR
        </p>
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: "14px",
            fontWeight: 400,
            color: "#607078",
            margin: 0,
          }}
        >
          Apunta la cámara al código QR de la tarima
        </p>
      </div>

      {/* Camera viewfinder */}
      <div
        style={{
          position: "relative",
          width: "min(320px, calc(100vw - 40px))",
          aspectRatio: "1 / 1",
          borderRadius: "20px",
          overflow: "hidden",
          background: "#172126",
        }}
      >
        <video
          ref={videoRef}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: error ? "none" : "block",
          }}
          muted
          playsInline
          autoPlay
        />

        {/* Corner guides */}
        {scanning && !error && (
          <>
            {[
              {
                top: 16,
                left: 16,
                borderTop: "3px solid #f2b84b",
                borderLeft: "3px solid #f2b84b",
              },
              {
                top: 16,
                right: 16,
                borderTop: "3px solid #f2b84b",
                borderRight: "3px solid #f2b84b",
              },
              {
                bottom: 16,
                left: 16,
                borderBottom: "3px solid #f2b84b",
                borderLeft: "3px solid #f2b84b",
              },
              {
                bottom: 16,
                right: 16,
                borderBottom: "3px solid #f2b84b",
                borderRight: "3px solid #f2b84b",
              },
            ].map((style, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  width: "28px",
                  height: "28px",
                  borderRadius: "3px",
                  ...style,
                }}
              />
            ))}
            {/* Scan line animation */}
            <div
              style={{
                position: "absolute",
                left: "10%",
                right: "10%",
                height: "2px",
                background: "rgba(242,184,75,0.7)",
                borderRadius: "1px",
                animation: "scanline 2s ease-in-out infinite",
              }}
            />
          </>
        )}

        {error && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              gap: "12px",
              padding: "24px",
            }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#607078"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: "12px",
                fontWeight: 400,
                color: "#b9c9cf",
                textAlign: "center",
                margin: 0,
              }}
            >
              {error}
            </p>
          </div>
        )}
      </div>

      {/* Manual fallback */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "10px",
          width: "100%",
          maxWidth: "320px",
        }}
      >
        <p
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: "12px",
            fontWeight: 400,
            color: "#607078",
            margin: 0,
          }}
        >
          ¿No funciona la cámara? Ingresa el ID manualmente
        </p>
        <form onSubmit={handleManual} style={{ display: "flex", gap: "8px", width: "100%" }}>
          <input
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            placeholder="TQR-24891-003"
            style={{
              flex: 1,
              height: "44px",
              padding: "0 14px",
              borderRadius: "10px",
              border: "1px solid #dce4e7",
              fontFamily: "Inter, sans-serif",
              fontSize: "14px",
              fontWeight: 600,
              color: "#172126",
              outline: "none",
            }}
          />
          <button
            type="submit"
            style={{
              height: "44px",
              padding: "0 18px",
              borderRadius: "10px",
              background: "#16343f",
              border: "none",
              fontFamily: "Inter, sans-serif",
              fontSize: "13px",
              fontWeight: 700,
              color: "white",
              cursor: "pointer",
            }}
          >
            Buscar
          </button>
        </form>
      </div>

      <button
        onClick={onClose}
        style={{
          height: "44px",
          padding: "0 24px",
          borderRadius: "12px",
          border: "1px solid #dce4e7",
          background: "white",
          fontFamily: "Inter, sans-serif",
          fontSize: "14px",
          fontWeight: 700,
          color: "#172126",
          cursor: "pointer",
        }}
      >
        Cancelar
      </button>

      <style>{`
        @keyframes scanline {
          0%   { top: 15%; }
          50%  { top: 80%; }
          100% { top: 15%; }
        }
      `}</style>
    </div>
  );
}
