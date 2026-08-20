import { useQuery } from "@tanstack/react-query";
import { listAuditLogs, type ListAuditLogsParams } from "@/lib/api/audit-logs";

export function useAuditLogsQuery(params: ListAuditLogsParams = {}) {
  return useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => listAuditLogs(params),
    placeholderData: (previous) => previous,
  });
}
