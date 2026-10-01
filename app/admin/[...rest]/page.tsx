import { notFound } from "next/navigation";

// Any /admin URL no route claims. Without this, Next renders the root
// not-found (public Navbar and Footer) instead of app/admin/not-found.tsx.
export default function UnknownAdminPage() {
  notFound();
}
