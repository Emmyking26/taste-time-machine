import type { PublicSignal } from "@/lib/agent/present";
import { WhyThis } from "./WhyThis";

function positionFor(index: number, total: number, radius: number): { x: number; y: number } {
  if (total <= 1) return { x: 500, y: 280 };
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  return {
    x: 500 + Math.cos(angle) * radius,
    y: 320 + Math.sin(angle) * radius,
  };
}

export function Constellation({ signals, hometown }: { signals: PublicSignal[]; hometown: string }) {
  const remembered = signals.find((signal) => signal.origin === "remembered") ?? signals[0];
  const others = signals.filter((signal) => signal !== remembered).slice(0, 12);
  const nodes = others.map((signal, index) => ({
    signal,
    ...positionFor(index, others.length, signal.group === "places" ? 210 : 160),
  }));

  return (
    <div className="my-[14px] -mx-[2vw] mb-[26px] p-0 max-[540px]:-mx-[12vw]">
      <svg className="h-auto w-full overflow-visible" viewBox="0 0 1000 640" role="img" aria-label={`Cultural connections around ${remembered?.name ?? hometown}`}>
        {nodes.map((node) => (
          <line
            key={node.signal.name}
            x1="500"
            y1="320"
            x2={node.x}
            y2={node.y}
            stroke="rgba(31,32,27,0.18)"
            strokeWidth="1"
          />
        ))}
        <circle cx="500" cy="320" r="78" fill="#30392c" stroke="#1f201b" strokeWidth="1" />
        <text x="500" y="312" textAnchor="middle" fontSize="13" letterSpacing="2" fontFamily="var(--font-sans), sans-serif" fill="#f5f1ea">
          REMEMBERED
        </text>
        <text x="500" y="338" textAnchor="middle" fontSize="21" fontFamily="var(--font-sans), sans-serif" fill="#f5f1ea">
          {remembered?.name ?? hometown}
        </text>
        {nodes.map((node) => (
          <g key={`node-${node.signal.name}`}>
            <circle cx={node.x} cy={node.y} r="48" fill={node.signal.origin === "remembered" ? "#dfc9bd" : "#ebe7df"} stroke="rgba(31,32,27,0.28)" />
            <text x={node.x} y={node.y + 4} textAnchor="middle" fontSize="13" fill="#1f201b">
              {node.signal.name.length > 16 ? `${node.signal.name.slice(0, 14)}…` : node.signal.name}
            </text>
          </g>
        ))}
      </svg>
      <p className="max-w-[32rem] text-[.88rem] text-[#687b8d]">
        A constellation of associations found from the memories you shared — not a map of cause and effect.
      </p>
      {remembered ? <WhyThis label={remembered.whyLabel} body={remembered.whyBody} /> : null}
    </div>
  );
}
