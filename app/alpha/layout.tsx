export default function AlphaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", overflowY: "auto", background: "#f9fafb" }}>
      {children}
    </div>
  );
}
