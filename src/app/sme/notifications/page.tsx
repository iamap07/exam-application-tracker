import { requireRole } from "@/lib/auth/session";
import { loadAll } from "@/lib/services/dashboard";
import { Badge, Card, PageHeader } from "@/components/ui";
import ActionButton from "@/components/client/ActionButton";

export default async function Notifications() {
  const s = await requireRole("sme");
  const mine = (await loadAll()).notifications.filter((n) => n.recipient_sme_id === s.smeId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <>
      <PageHeader title="Notifications" />
      {mine.length === 0 ? <Card><p className="text-sm text-slate-600">Nothing yet. New assignments and review results appear here.</p></Card> : (
        <ul className="space-y-3">{mine.map((n) => (<li key={n.notification_id}><Card><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-sm font-semibold">{n.subject}</h2><p className="mt-1 text-sm text-slate-700">{n.message}</p><p className="mt-1 text-xs text-slate-500">{n.created_at.slice(0, 16).replace("T", " ")}</p></div>{n.read_status === "Unread" ? <ActionButton label="Mark as read" url={`/api/sme/notifications/${n.notification_id}/read`} /> : <Badge>Read</Badge>}</div></Card></li>))}</ul>)}
    </>
  );
}
