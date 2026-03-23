interface Props {
  label: string;
  value: number;
  color: string;
}

export function StatBar({ label, value, color }: Props) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontFamily: "monospace", color: "#94a3b8" }}>{label}</span>
        <span style={{ fontSize: 11, fontFamily: "monospace", color: "#e2e8f0" }}>{value}</span>
      </div>
      <div style={{ background: "#1e293b", height: 8, borderRadius: 2, border: "1px solid #334155" }}>
        <div style={{
          height: "100%",
          width: `${value}%`,
          background: color,
          borderRadius: 2,
          transition: "width 0.6s ease",
        }} />
      </div>
    </div>
  );
}