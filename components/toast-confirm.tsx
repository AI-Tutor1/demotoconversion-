"use client";

import { useStore } from "@/lib/store";
import { ConfirmModal } from "@/components/ui";

export default function ToastAndConfirm() {
  const { toast, confirm, setConfirm } = useStore();

  return (
    <>
      {toast && <div className="toast">{toast}</div>}
      {confirm && (
        <ConfirmModal
          title={confirm.title}
          msg={confirm.msg}
          onConfirm={() => {
            confirm.onConfirm();
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}
