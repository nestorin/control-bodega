/**
 * Paso 4: Coincidir productos con catálogo
 * Autocomplete mejorado por producto, mobile-first
 */

import {
  ChevronLeft,
  ChevronRight,
  Search,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
  ChevronDown,
} from "lucide-react"
import { TouchTarget } from "@/components/ui/TouchTarget"
import { useState, useMemo, useRef, useEffect } from "react"

interface Props {
  state: any
  matchedProducts: any[]
  catalogProducts: any[]
  onUpdateMatch: (index: number, updates: Partial<any>) => void
  onPrev: () => void
  onNext: () => void
}

export default function MatchProducts({
  state,
  matchedProducts,
  catalogProducts,
  onUpdateMatch,
  onPrev,
  onNext,
}: Props) {
  const allConfirmed =
    matchedProducts.length > 0 &&
    matchedProducts.every((p) => p.estadoMatch === "confirmado")

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl md:text-3xl font-bold text-[#16343f] mb-2">
          Coincidir con catálogo
        </h2>
        <p className="text-[#607078] text-sm">
          Verifica y corrige la coincidencia de cada producto. Los no
          encontrados se pueden crear manualmente.
        </p>
      </div>

      {matchedProducts.length === 0 && (
        <div className="text-center py-12 bg-[#f8fafb] border border-[#dce4e7] rounded-[16px]">
          <AlertCircle className="w-12 h-12 mx-auto text-[#fca5a5] mb-3" />
          <h3 className="text-lg font-medium text-[#16343f] mb-1">
            Sin productos para coincidir
          </h3>
          <p className="text-[#607078]">El OCR no detectó productos válidos.</p>
        </div>
      )}

      <div className="space-y-4 mb-6">
        {matchedProducts.map((product, idx) => (
          <ProductMatchRow
            key={idx}
            index={idx}
            product={product}
            catalog={catalogProducts}
            onUpdate={onUpdateMatch}
          />
        ))}
      </div>

      {matchedProducts.length > 0 && (
        <div className="flex gap-4 pt-4 border-t border-[#dce4e7] sticky bottom-0 bg-white/95 backdrop-blur-sm pb-4 mt-4">
          <TouchTarget
            as="button"
            onClick={onPrev}
            className="flex-1 py-4 rounded-[12px] font-bold text-lg bg-white border border-[#dce4e7] text-[#16343f] hover:bg-[#f0f4f5] touch-target"
          >
            <ChevronLeft className="inline w-5 h-5 mr-2" /> Volver
          </TouchTarget>
          <TouchTarget
            as="button"
            onClick={onNext}
            disabled={!allConfirmed}
            className={`flex-1 py-4 rounded-[12px] font-bold text-lg transition-colors touch-target ${
              allConfirmed
                ? "bg-[#16343f] text-white hover:bg-[#0d2630]"
                : "bg-[#dce4e7] text-[#607078] cursor-not-allowed"
            }`}
          >
            Continuar <ChevronRight className="inline w-5 h-5 ml-2" />
          </TouchTarget>
        </div>
      )}
    </div>
  )
}

function ProductMatchRow({
  index,
  product,
  catalog,
  onUpdate,
}: {
  index: number
  product: any
  catalog: any[]
  onUpdate: (index: number, updates: Partial<any>) => void
}) {
  const isConfirmed = product.estadoMatch === "confirmado"
  const isSuggested = product.estadoMatch === "sugerido"
  const [searchTerm, setSearchTerm] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLUListElement>(null)

  // Filtrar catálogo basado en searchTerm
  const filteredCatalog = useMemo(() => {
    if (!searchTerm.trim()) return catalog
    const term = searchTerm.toLowerCase()
    return catalog.filter(
      (p) =>
        p.nombre.toLowerCase().includes(term) ||
        p.codigosProveedor?.some((c: string) =>
          c.toLowerCase().includes(term),
        ) ||
        p.sku?.toLowerCase().includes(term),
    )
  }, [catalog, searchTerm])

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false)
        setHighlightedIndex(-1)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Navegación por teclado
  useEffect(() => {
    if (!showDropdown) return

    function handleKeyDown(event: KeyboardEvent) {
      const maxIndex = Math.min(filteredCatalog.length, 10) - 1
      if (maxIndex < 0) return

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault()
          setHighlightedIndex((prev) => (prev < maxIndex ? prev + 1 : 0))
          break
        case "ArrowUp":
          event.preventDefault()
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : maxIndex))
          break
        case "Enter":
          event.preventDefault()
          if (highlightedIndex >= 0) {
            selectProduct(filteredCatalog[highlightedIndex])
          }
          break
        case "Escape":
          setShowDropdown(false)
          setHighlightedIndex(-1)
          inputRef.current?.blur()
          break
      }
    }

    inputRef.current?.addEventListener("keydown", handleKeyDown)
    return () => inputRef.current?.removeEventListener("keydown", handleKeyDown)
  }, [showDropdown, filteredCatalog, highlightedIndex])

  // Scroll a elemento destacado
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const item = dropdownRef.current.children[highlightedIndex] as HTMLElement
      item?.scrollIntoView({ block: "nearest" })
    }
  }, [highlightedIndex])

  const selectProduct = (cat: any) => {
    onUpdate(index, {
      productId: cat.id,
      estadoMatch: "confirmado",
      codigo: cat.codigosProveedor?.[0] || cat.sku || product.codigo,
      nombre: cat.nombre, // Usar nombre del catálogo
      unidad: cat.unidad || product.unidad,
    })
    setSearchTerm("")
    setShowDropdown(false)
    setHighlightedIndex(-1)
    inputRef.current?.blur()
  }

  const handleInputFocus = () => {
    if (!isConfirmed) {
      setShowDropdown(true)
    }
  }

  const handleInputChange = (value: string) => {
    setSearchTerm(value)
    setShowDropdown(true)
    setHighlightedIndex(-1)
  }

  const handleClearSearch = () => {
    setSearchTerm("")
    setHighlightedIndex(-1)
    inputRef.current?.focus()
  }

  const handleCreateManual = () => {
    onUpdate(index, {
      estadoMatch: "manual",
      productId: null,
    })
    setSearchTerm("")
    setShowDropdown(false)
  }

  return (
    <div
      className={`bg-white border rounded-[12px] p-4 transition-all ${
        isConfirmed ? "border-[#dcfce7] bg-[#f0fdf4]" : "border-[#dce4e7]"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="w-8 text-center text-[#607078] font-medium mt-1">
          {index + 1}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="font-mono text-sm text-[#16343f] bg-[#f0f4f5] px-2 py-1 rounded">
              {product.codigo || "—"}
            </span>
            <span className="font-medium text-[#16343f] truncate">
              {product.nombre}
            </span>
            <span className="text-sm text-[#607078]">
              ({product.unidad || "cajas"})
            </span>
            <span className="ml-auto font-mono text-[#16343f]">
              ${product.importe?.toFixed(2) || "0.00"}
            </span>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <label
              htmlFor={`match-product-${index}-quantity`}
              className="text-sm text-[#607078] min-w-[80px] whitespace-nowrap"
            >
              Cantidad:
            </label>
            <input
              id={`match-product-${index}-quantity`}
              name={`matchedProducts[${index}][quantity]`}
              type="number"
              min="0"
              step="1"
              value={product.cantidad}
              onChange={(e) =>
                onUpdate(index, { cantidad: parseInt(e.target.value) || 0 })
              }
              className="w-24 px-3 py-2 border border-[#dce4e7] rounded-[8px] text-center font-mono text-[#16343f] focus:border-[#3276a8] focus:outline-none focus:ring-1 focus:ring-[#3276a8] touch-target"
              inputMode="numeric"
            />
          </div>

          {!isConfirmed && (
            <div className="relative">
              <label
                htmlFor={`match-product-${index}-catalog-search`}
                className="block text-sm text-[#607078] mb-1"
              >
                Buscar en catálogo:
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
                <input
                  ref={inputRef}
                  id={`match-product-${index}-catalog-search`}
                  name={`matchedProducts[${index}][catalogSearch]`}
                  type="text"
                  placeholder={
                    isSuggested
                      ? "Sugerido: escribe para buscar..."
                      : "Escribe para buscar en catálogo..."
                  }
                  value={searchTerm}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onFocus={handleInputFocus}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                  className="w-full pl-10 pr-12 py-3 border border-[#dce4e7] rounded-[10px] text-base focus:border-[#3276a8] focus:outline-none focus:ring-2 focus:ring-[#3276a8]/20 touch-target"
                  inputMode="text"
                  autoComplete="off"
                />
                {searchTerm && (
                  <TouchTarget
                    as="button"
                    onClick={handleClearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#9ca3af] hover:text-[#607078]"
                    aria-label="Limpiar búsqueda"
                  >
                    <X className="w-5 h-5" />
                  </TouchTarget>
                )}
                <ChevronDown className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9ca3af]" />
              </div>

              {showDropdown && (
                <ul
                  ref={dropdownRef}
                  className="mt-1 max-h-56 overflow-y-auto bg-white border border-[#dce4e7] rounded-[10px] shadow-lg z-20 w-full"
                  role="listbox"
                >
                  {filteredCatalog.length > 0 ? (
                    filteredCatalog
                      .slice(0, 15)
                      .map((cat: any, catIdx: number) => (
                        <li
                          key={cat.id}
                          role="option"
                          aria-selected={catIdx === highlightedIndex}
                          className={`px-3 py-3 cursor-pointer border-b border-[#dce4e7] last:border-0 transition-colors flex items-center justify-between gap-2 ${
                            catIdx === highlightedIndex
                              ? "bg-[#e7f0f2]"
                              : "hover:bg-[#f8fafb]"
                          }`}
                          onClick={() => selectProduct(cat)}
                          onMouseEnter={() => setHighlightedIndex(catIdx)}
                        >
                          <div className="flex-1 min-w-0">
                            <p
                              className={`font-medium text-[#16343f] ${
                                catIdx === highlightedIndex
                                  ? "text-[#16343f]"
                                  : ""
                              }`}
                            >
                              {cat.nombre}
                            </p>
                            <p className="text-xs text-[#607078] truncate">
                              {cat.codigosProveedor?.join(", ") ||
                                cat.sku ||
                                "Sin código"}
                              {cat.unidad && ` · ${cat.unidad}`}
                            </p>
                          </div>
                          <TouchTarget
                            as="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              selectProduct(cat)
                            }}
                            className="px-3 py-1.5 text-sm bg-[#16343f] text-white rounded-[6px] hover:bg-[#0d2630] touch-target whitespace-nowrap flex-shrink-0"
                          >
                            Seleccionar
                          </TouchTarget>
                        </li>
                      ))
                  ) : (
                    <li className="px-3 py-3 text-center text-[#ef4444] text-sm">
                      No hay coincidencias. Se creará como producto nuevo.
                    </li>
                  )}
                </ul>
              )}

              {filteredCatalog.length === 0 && searchTerm && !isSuggested && (
                <div className="mt-2 p-3 bg-[#fef3c7] border border-[#fcd34d] rounded-[8px] flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-[#f59e0b] shrink-0" />
                  <div className="text-sm text-[#92400e]">
                    <p className="font-medium">No se encontró en catálogo</p>
                    <p>¿Crear como producto nuevo?</p>
                  </div>
                  <TouchTarget
                    as="button"
                    onClick={handleCreateManual}
                    className="ml-auto px-3 py-1.5 text-sm bg-[#f59e0b] text-white rounded-[6px] hover:bg-[#d97706] touch-target"
                  >
                    Crear manual
                  </TouchTarget>
                </div>
              )}
            </div>
          )}

          {isConfirmed && (
            <div className="mt-3 p-3 bg-[#dcfce7] border border-[#86efac] rounded-[8px] flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-[#166534] shrink-0" />
              <span className="text-sm text-[#166534]">
                Confirmado:{" "}
                {product.productId
                  ? "ID " + product.productId.slice(0, 8)
                  : "Producto existente"}
              </span>
            </div>
          )}
        </div>

        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
            isConfirmed
              ? "bg-[#dcfce7] text-[#166534]"
              : isSuggested
                ? "bg-[#fef3c7] text-[#92400e]"
                : "bg-[#fee2e2] text-[#991b1b]"
          }`}
        >
          {isConfirmed ? (
            <CheckCircle className="w-6 h-6" />
          ) : (
            <AlertCircle className="w-6 h-6" />
          )}
        </div>
      </div>
    </div>
  )
}
