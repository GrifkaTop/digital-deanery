import { redirect } from "next/navigation";
import { atlasLoginHref } from "@/components/login-destination";
import InterfacePrototype from "@/components/prototype/interface";
import { HttpError, requireActor } from "@/server/auth/service";

export async function AtlasPage() {
  try {
    await requireActor();
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 401) throw error;
    redirect(atlasLoginHref);
  }
  return <InterfacePrototype />;
}
export default AtlasPage;
