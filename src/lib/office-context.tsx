"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { Office, OfficeMember } from "./office-types";
import {
  getOffice,
  subscribeOfficeMembers,
  subscribeUserOfficeId,
} from "./office-firestore";

type OfficeContextValue = {
  officeId: string | null;
  office: Office | null;
  members: OfficeMember[];
  currentMember: OfficeMember | null;
  isAdmin: boolean;
  loading: boolean;
};

const OfficeContext = createContext<OfficeContextValue>({
  officeId: null,
  office: null,
  members: [],
  currentMember: null,
  isAdmin: false,
  loading: true,
});

export const useOffice = () => useContext(OfficeContext);

export function OfficeProvider({
  uid,
  children,
}: {
  uid: string;
  children: React.ReactNode;
}) {
  const [officeId, setOfficeId] = useState<string | null>(null);
  const [office, setOffice] = useState<Office | null>(null);
  const [members, setMembers] = useState<OfficeMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Écouter le rattachement de l'utilisateur à une étude
  useEffect(() => {
    const unsub = subscribeUserOfficeId(uid, async (id) => {
      setOfficeId(id);
      if (id) {
        const o = await getOffice(id);
        setOffice(o);
      } else {
        setOffice(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [uid]);

  // Écouter les membres de l'étude
  useEffect(() => {
    if (!officeId) return;
    const unsub = subscribeOfficeMembers(officeId, setMembers);
    return () => unsub();
  }, [officeId]);

  const currentMember = members.find((m) => m.uid === uid) ?? null;
  const isAdmin = currentMember?.role === "admin";

  return (
    <OfficeContext.Provider
      value={{ officeId, office, members, currentMember, isAdmin, loading }}
    >
      {children}
    </OfficeContext.Provider>
  );
}
