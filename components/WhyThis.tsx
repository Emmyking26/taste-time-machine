"use client";

import { useId, useState } from "react";

export function WhyThis({ label, body }: { label: string; body: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div>
      <button
        type="button"
        className="min-h-0 border-0 border-b border-[#a4bac9] bg-transparent px-0 py-[6px] text-[#172433]"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
      >
        Why this?
      </button>
      {open ? (
        <div className="mt-[10px] max-w-[350px] rounded-r-xl border-l-2 border-[#6f2dbd] bg-[#f2eaff] p-[17px] text-[.88rem] text-[#687b8d]" id={id}>
          <strong className="text-[#172433]">{label}</strong>
          <p className="m-0 mt-[6px]">{body}</p>
        </div>
      ) : null}
    </div>
  );
}
