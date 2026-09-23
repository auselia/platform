-- Let an org's Owner delete cavitation captures (and their full-resolution waveforms) from
-- the dashboard, e.g. to clear a flood caused by a logger fault. Until now captures were
-- read-only apart from the flag columns.
--
-- Owner only, not Editor: it is irreversible and can remove many rows at once, so it sits at
-- the same level as managing who has access. Rows are still only ever created by the
-- cavitation-ingest Edge Function.

grant delete on cavitation_captures to authenticated;

create policy delete_cavitation_as_owner on cavitation_captures for delete
  using (plant_id in (select id from plants where is_org_owner(org_id)));

-- The full waveforms live in Storage at <plant_id>/<capture_key>.bin.gz. The dashboard removes
-- them through the Storage API right after deleting the rows, so the Owner needs the same
-- delete right on the objects or they would be orphaned.
create policy delete_cavitation_full_as_owner on storage.objects for delete
  using (
    bucket_id = 'cavitation-full'
    and (storage.foldername(name))[1] in (
      select id::text from plants where is_org_owner(org_id)
    )
  );
