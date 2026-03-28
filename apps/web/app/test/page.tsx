import { useEffect } from "react";
export default function Page() {
  return <ClientComp />;
}
function ClientComp() {
  "use client";
  useEffect(() => {}, []);
  return <div>Client</div>;
}
