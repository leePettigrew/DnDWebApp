"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { ShieldIcon } from "@/components/ui/icons";
import { useCurrentUser } from "@/lib/data/hooks";
import { AdminPanel } from "@/components/admin/AdminPanel";

export default function AdminPage() {
  const user = useCurrentUser();
  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow="Server"
        title="Admin"
        description="Everything on the server — every campaign, user, and action — with edit and delete."
      />
      {user?.isAdmin ? (
        <AdminPanel />
      ) : (
        <Panel tone="flat">
          <EmptyState
            icon={<ShieldIcon />}
            title="Admins only"
            description="Sign in as the server owner (ADMIN_USERNAME) to manage the server."
          />
        </Panel>
      )}
    </div>
  );
}
