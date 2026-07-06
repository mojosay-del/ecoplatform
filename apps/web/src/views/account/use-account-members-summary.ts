"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";

export type AccountMembersSummary = {
  membersCount: number;
  pendingInvites: number;
};

// Лёгкая сводка для плитки «Сотрудники»: сколько людей в компании и сколько
// приглашений ждёт ответа. Грузится только владельцу; после закрытия модалки
// «Сотрудники» вызывается reload, чтобы плитка не отставала от списка.
export function useAccountMembersSummary(enabled: boolean) {
  const [summary, setSummary] = useState<AccountMembersSummary | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "loaded" | "error">("idle");

  const reload = useCallback(() => {
    if (!enabled) return;
    setState((current) => (current === "loaded" ? current : "loading"));
    api.companyMembers
      .list()
      .then((view) => {
        setSummary({
          membersCount: view.members.length,
          pendingInvites: view.invitations.filter((invitation) => invitation.status === "pending").length,
        });
        setState("loaded");
      })
      .catch(() => setState("error"));
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { reload, state, summary };
}
