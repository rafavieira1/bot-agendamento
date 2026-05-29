create policy resp_self on responsaveis for select to authenticated
  using (auth_user_id = auth.uid());

create policy conv_select_by_resp on conversas for select to authenticated
  using (responsavel_id in (select id from responsaveis where auth_user_id = auth.uid()));

create policy conv_update_by_resp on conversas for update to authenticated
  using (responsavel_id in (select id from responsaveis where auth_user_id = auth.uid()))
  with check (responsavel_id in (select id from responsaveis where auth_user_id = auth.uid()));

create policy msg_select_by_resp on mensagens for select to authenticated
  using (conversa_id in (
    select id from conversas where responsavel_id in
    (select id from responsaveis where auth_user_id = auth.uid())
  ));

create policy notif_select_by_resp on notificacoes_pendentes for select to authenticated
  using (conversa_id in (
    select id from conversas where responsavel_id in
    (select id from responsaveis where auth_user_id = auth.uid())
  ));
