import { getFirestore, collection, doc, getDoc, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Obtiene stock disponible de un producto en un almacén
 * Busca en la colección 'inventario' o 'stock' según la estructura real
 */
export async function getStockDisponible(almacenId: string, productoId: string): Promise<number> {
  const firestore = db;
  if (!firestore) return 0;
  try {
    // Intentar buscar en colección 'inventario' con estructura: { almacenId, productoId, cantidad }
    const inventarioRef = collection(firestore, "inventario");
    const q = query(
      inventarioRef,
      where("almacenId", "==", almacenId),
      where("productoId", "==", productoId),
    );
    const snap = await getDocs(q);

    if (!snap.empty) {
      let total = 0;
      snap.forEach((doc) => {
        const data = doc.data();
        total += data.cantidad ?? data.stock ?? data.disponible ?? 0;
      });
      return total;
    }

    // Fallback: buscar en 'stock' collection
    const stockRef = collection(firestore, "stock");
    const q2 = query(
      stockRef,
      where("almacenId", "==", almacenId),
      where("productoId", "==", productoId),
    );
    const snap2 = await getDocs(q2);

    if (!snap2.empty) {
      let total = 0;
      snap2.forEach((doc) => {
        const data = doc.data();
        total += data.cantidad ?? data.stock ?? data.disponible ?? 0;
      });
      return total;
    }

    // Fallback: buscar en subcolección almacenes/{almacenId}/productos/{productoId}
    try {
      const prodRef = doc(firestore, "almacenes", almacenId, "productos", productoId);
      const prodSnap = await getDoc(prodRef);
      if (prodSnap.exists()) {
        const data = prodSnap.data();
        return data.cantidad ?? data.stock ?? data.disponible ?? 0;
      }
    } catch {
      // Ignore
    }

    return 0;
  } catch (error) {
    console.warn("Error getting stock:", error);
    return 0;
  }
}

/**
 * Obtiene stock de múltiples productos
 */
export async function getStockMultiple(
  almacenId: string,
  productos: { productoId: string }[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  await Promise.all(
    productos.map(async ({ productoId }) => {
      const stock = await getStockDisponible(almacenId, productoId);
      result.set(productoId, stock);
    }),
  );

  return result;
}
