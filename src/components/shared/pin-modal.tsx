"use client";

import React, { useState } from "react";
import { useOperator } from "./operator-context";
import { Lock, ShieldAlert, X } from "lucide-react";

export function PinModal() {
  const { isPinModalOpen, pinModalTitle, pinError, submitPin, closePinModal, activeOperator } = useOperator();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isPinModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) return;
    setLoading(true);
    await submitPin(pin);
    setLoading(false);
    setPin("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden text-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <button
            onClick={closePinModal}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
            <span>تأكيد العملية الحساسة</span>
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">{pinModalTitle}</h3>
            <p className="text-xs text-slate-500">
              المشغل الحالي: <span className="font-semibold text-slate-700">{activeOperator?.name}</span>
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-700">أدخل الرمز السري للمشغل (PIN Code):</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              autoFocus
              className="w-full text-center text-2xl tracking-widest px-4 py-2.5 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 font-mono"
            />
            {pinError && <p className="text-xs text-rose-600 text-center font-medium">{pinError}</p>}
            <p className="text-[11px] text-slate-400 text-center">
              (الرمز الافتراضي للموثق: 1234 / الكاتب: 0000)
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={closePinModal}
              className="flex-1 px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={loading || !pin}
              className="flex-1 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors"
            >
              {loading ? "جاري التحقق..." : "تأكيد ومتابعة"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
