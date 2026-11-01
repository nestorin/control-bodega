import { PalletDoc } from "@/services/firestore/types";
import { Timestamp } from "firebase/firestore";

export interface TarimaDetailView {
  receptionId?: string;
  qrIdentifier: string;
  lot: string;
  expiryDate: Timestamp;
  quantity: number;
  unit: string;
  status: PalletDoc["status"];
  location?: string;
  notes?: string;
  createdAt: Timestamp;
  productName: string;
  productCode: string;
  supplierName: string;
  supplierCode?: string;
  receptionFolio?: string;
  receptionDate?: Timestamp;
}

export type TarimaDetailState =
  | { status: "loading" }
  | {
      status: "success";
      data: TarimaDetailView;
    }
  | {
      status: "not-found";
      qrCode: string;
    }
  | {
      status: "error";
      message: string;
      retry: () => void;
    };
