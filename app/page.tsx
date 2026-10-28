import Dashboard from "./tracker";
import { requireUser } from "../lib/auth";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await requireUser();
  return <Dashboard userName={user.displayName} />;
}
