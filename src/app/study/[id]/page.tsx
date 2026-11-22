import { Account } from "@/components/account";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Account screen="discipline" id={(await params).id} />;
}
