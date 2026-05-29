import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, type Responsavel } from '../lib/supabase';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [responsavel, setResponsavel] = useState<Responsavel | null>(null);
  const [fetchedForUserId, setFetchedForUserId] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setResponsavel(null);
      setFetchedForUserId(null);
      return;
    }
    const uid = session.user.id;
    supabase
      .from('responsaveis')
      .select('*')
      .eq('auth_user_id', uid)
      .maybeSingle()
      .then(({ data }) => {
        setResponsavel(data as Responsavel | null);
        setFetchedForUserId(uid);
      });
  }, [session]);

  const loading =
    sessionLoading || (!!session && fetchedForUserId !== session.user.id);

  return {
    session,
    responsavel,
    loading,
    signIn: (email: string, password: string) =>
      supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
  };
}
