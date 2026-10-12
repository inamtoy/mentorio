import { useState } from "react";
import { ApiError } from "@/lib/api/client";
import { useChangePasswordMutation } from "@/lib/queries/users";
import { useAuthStore } from "@/lib/store/auth-store";
import { toast } from "@/lib/store/toast-store";

export interface ChangeOwnPasswordMessages {
  fillAll: string;
  mismatch: string;
  success: string;
  failed: string;
}

/** Form state + submit for the "Change password" card on every portal's
 * Settings page. Talks to the real self-service endpoint (PATCH
 * /users/{me}/ with current_password), which also signs out the user's
 * other devices — this one stays signed in. */
export function useChangeOwnPassword(messages: ChangeOwnPasswordMessages) {
  const userId = useAuthStore((s) => s.user?.id);
  const mutation = useChangePasswordMutation();
  const [passwords, setPasswords] = useState({ current: "", next: "", confirm: "" });

  async function submit() {
    if (!userId) return;
    if (!passwords.current || !passwords.next || !passwords.confirm) {
      toast.error(messages.fillAll);
      return;
    }
    if (passwords.next !== passwords.confirm) {
      toast.error(messages.mismatch);
      return;
    }
    try {
      await mutation.mutateAsync({ userId, currentPassword: passwords.current, newPassword: passwords.next });
      toast.success(messages.success);
      setPasswords({ current: "", next: "", confirm: "" });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : messages.failed);
    }
  }

  return { passwords, setPasswords, submit, isPending: mutation.isPending };
}
