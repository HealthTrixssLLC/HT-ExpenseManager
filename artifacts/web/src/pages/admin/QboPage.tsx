import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminGetQboConnection,
  getAdminGetQboConnectionQueryKey,
  useAdminConnectQboStub,
  useAdminDisconnectQbo
} from "@workspace/api-client-react";
import { HtCard, HtCardHeader } from "@/components/brand/Card";
import { HelpLink } from "@/components/help/HelpLink";
import { Button } from "@/components/ui/button";
import { Link2, Unlink } from "lucide-react";
import { formatDateTime } from "@/lib/format";

export function QboPage() {
  const qc = useQueryClient();
  const { data: connection, isLoading } = useAdminGetQboConnection({
    query: { queryKey: getAdminGetQboConnectionQueryKey() }
  });

  const connect = useAdminConnectQboStub();
  const disconnect = useAdminDisconnectQbo();

  const handleConnect = () => {
    connect.mutate(undefined, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getAdminGetQboConnectionQueryKey() })
    });
  };

  const handleDisconnect = () => {
    disconnect.mutate(undefined, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getAdminGetQboConnectionQueryKey() })
    });
  };

  return (
    <div className="space-y-6" data-testid="page-qbo">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ht-ink)]">
            QuickBooks Online Integration
          </h1>
          <p className="text-sm text-[var(--ht-ink-3)]">
            Connect Healthtrix Expense to QuickBooks to automatically post approved expense reports as journal entries.
          </p>
        </div>
        <HelpLink topicId="admin-qbo" />
      </div>

      <div style={{ maxWidth: "42rem" }}>
        <HtCard>
          <HtCardHeader title="Connection Status" />
          <div className="p-6 space-y-6">
            {isLoading ? (
              <div className="text-sm text-[var(--ht-ink-3)]">Loading connection status...</div>
            ) : connection?.status === "connected" ? (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <Link2 className="w-5 h-5 text-green-700" />
                </div>
                <div>
                  <h3 className="font-medium text-green-800">Connected to QuickBooks Online</h3>
                  <p className="text-sm text-green-600">Company ID (Realm): {connection.realmId}</p>
                </div>
              </div>
              
              <div className="bg-gray-50 p-4 rounded-md text-sm text-[var(--ht-ink-2)]">
                <p className="mb-2"><span className="font-medium">Connected On:</span> {formatDateTime(connection.connectedAt!)}</p>
                <p>This integration will automatically create Journal Entries in QBO when Finance approves a report. Make sure your GL Mappings are configured correctly.</p>
              </div>

              <div className="pt-4 border-t border-[var(--ht-border)] flex justify-end">
                <Button variant="destructive" onClick={handleDisconnect} disabled={disconnect.isPending}>
                  <Unlink className="w-4 h-4 mr-2" />
                  {disconnect.isPending ? "Disconnecting..." : "Disconnect QBO"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                  <Unlink className="w-5 h-5 text-gray-500" />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">Not Connected</h3>
                  <p className="text-sm text-gray-500">Connect your QuickBooks company file to enable sync.</p>
                </div>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-md text-sm text-blue-800 border border-blue-200">
                <p className="font-medium mb-1">Demo Mode Notice</p>
                <p>This is a simulated connection for the Healthtrix Expense demo. Clicking "Connect" will establish a mock connection without requiring actual Intuit OAuth credentials.</p>
              </div>

              <div className="pt-4 border-t border-[var(--ht-border)] flex justify-end">
                <Button onClick={handleConnect} disabled={connect.isPending} className="bg-[#2CA01C] hover:bg-[#238116] text-white">
                  <Link2 className="w-4 h-4 mr-2" />
                  {connect.isPending ? "Connecting..." : "Connect to QuickBooks"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </HtCard>
    </div>
    </div>
  );
}
