"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { getOperatorsAction, verifyOperatorPinAction, type OperatorDto } from "@/server/actions/operators";

interface OperatorContextType {
  activeOperator: OperatorDto | null;
  operators: OperatorDto[];
  setActiveOperator: (op: OperatorDto) => void;
  requestPinAuthorization: (actionTitle: string, onAuthorized: () => void) => void;
  isPinModalOpen: boolean;
  pinModalTitle: string;
  pinError: string | null;
  submitPin: (pin: string) => Promise<boolean>;
  closePinModal: () => void;
}

const OperatorContext = createContext<OperatorContextType | null>(null);

export function OperatorProvider({ children }: { children: React.ReactNode }) {
  const [operators, setOperators] = useState<OperatorDto[]>([]);
  const [activeOperator, setActiveOperatorState] = useState<OperatorDto | null>(null);

  // PIN modal state
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinModalTitle, setPinModalTitle] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pendingCallback, setPendingCallback] = useState<(() => void) | null>(null);

  useEffect(() => {
    getOperatorsAction().then((ops) => {
      setOperators(ops);
      if (ops.length > 0) {
        // Load saved operator or default to first (Notary)
        const savedId = typeof window !== "undefined" ? localStorage.getItem("notary_active_op_id") : null;
        const found = ops.find((o) => String(o.id) === savedId);
        setActiveOperatorState(found || ops[0]);
      }
    });
  }, []);

  const setActiveOperator = (op: OperatorDto) => {
    setActiveOperatorState(op);
    if (typeof window !== "undefined") {
      localStorage.setItem("notary_active_op_id", String(op.id));
    }
  };

  const requestPinAuthorization = (actionTitle: string, onAuthorized: () => void) => {
    setPinModalTitle(actionTitle);
    setPinError(null);
    setPendingCallback(() => onAuthorized);
    setIsPinModalOpen(true);
  };

  const submitPin = async (pin: string): Promise<boolean> => {
    if (!activeOperator) return false;
    const res = await verifyOperatorPinAction(activeOperator.id, pin);
    if (res.success) {
      setIsPinModalOpen(false);
      setPinError(null);
      if (pendingCallback) {
        pendingCallback();
        setPendingCallback(null);
      }
      return true;
    } else {
      setPinError(res.message || "الرمز السري غير صحيح");
      return false;
    }
  };

  const closePinModal = () => {
    setIsPinModalOpen(false);
    setPendingCallback(null);
    setPinError(null);
  };

  return (
    <OperatorContext.Provider
      value={{
        activeOperator,
        operators,
        setActiveOperator,
        requestPinAuthorization,
        isPinModalOpen,
        pinModalTitle,
        pinError,
        submitPin,
        closePinModal,
      }}
    >
      {children}
    </OperatorContext.Provider>
  );
}

export function useOperator() {
  const ctx = useContext(OperatorContext);
  if (!ctx) {
    throw new Error("useOperator must be used within an OperatorProvider");
  }
  return ctx;
}
