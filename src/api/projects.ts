import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { refreshTheBooks } from '@/lib/queryClient';

import { supabase } from '@/lib/supabase';
import type { Range } from '@/api/dashboard';
import type { PersonShare, Project, ProjectCrewMember, ProjectTotal } from '@/types';

/**
 * Projects: what the money was spent on.
 *
 * Every one of these is refused by the database to anybody who is not an
 * Admin, a Sub-admin or a head, and a head is handed only his own
 * people's share. The screens hide what a person may not see; the
 * database is what makes it true.
 */

/** The list for the picker: open projects, newest first. */
export function useProjects(enabled = true) {
  return useQuery({
    queryKey: ['projects'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, note, is_active, created_by, created_at, closed_at, started_on')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Project[];
    },
  });
}

/** Every project with what has been spent on it, for a period. */
export function useProjectTotals(range: Range, enabled = true) {
  return useQuery({
    queryKey: ['projects', 'totals', range],
    enabled,
    queryFn: async (): Promise<ProjectTotal[]> => {
      const { data, error } = await supabase.rpc('project_totals', {
        p_from: range.from ?? undefined,
        p_to: range.to ?? undefined,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as ProjectTotal[];
    },
  });
}

/** What was spent without being filed against any project. */
export function useUnfiledExpenses(range: Range, enabled = true) {
  return useQuery({
    queryKey: ['projects', 'unfiled', range],
    enabled,
    queryFn: async (): Promise<{ spent: number; entry_count: number }> => {
      const { data, error } = await supabase.rpc('unfiled_expenses', {
        p_from: range.from ?? undefined,
        p_to: range.to ?? undefined,
      });
      if (error) throw new Error(error.message);
      const row = (data ?? [])[0];
      return { spent: Number(row?.spent ?? 0), entry_count: Number(row?.entry_count ?? 0) };
    },
  });
}

/**
 * One project, split by the person who did the spending. A null project
 * asks for the expenses that have not been filed against one.
 */
export function useProjectByPerson(
  projectId: string | null | undefined,
  range: Range,
  enabled = true,
) {
  return useQuery({
    queryKey: ['projects', 'by-person', projectId ?? 'unfiled', range],
    enabled,
    queryFn: async (): Promise<PersonShare[]> => {
      const { data, error } = await supabase.rpc('project_by_person', {
        p_project_id: projectId ?? undefined,
        p_from: range.from ?? undefined,
        p_to: range.to ?? undefined,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as PersonShare[];
    },
  });
}

/**
 * Write down a project. The database hands back the one already there
 * when the name matches, so two people naming the same site on the same
 * morning end up filing against one project rather than two.
 */
export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<Project> => {
      const { data, error } = await supabase.rpc('create_project', { p_name: name });
      if (error) throw new Error(error.message);
      return data as unknown as Project;
    },
    onSuccess: () => refreshTheBooks(qc),
  });
}

/** File an expense that is already recorded against a project, or unfile it. */
export function useSetEntryProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      entryId,
      projectId,
    }: {
      entryId: string;
      projectId: string | null;
    }): Promise<void> => {
      const { error } = await supabase.rpc('set_entry_project', {
        p_entry_id: entryId,
        p_project_id: projectId ?? undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refreshTheBooks(qc),
  });
}

/** Mark a project finished. Nothing new can be put on it afterwards. */
export function useCloseProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.rpc('close_project', { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refreshTheBooks(qc),
  });
}

/** Open a finished project again, for when the wrong button was pressed. */
export function useReopenProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.rpc('reopen_project', { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refreshTheBooks(qc),
  });
}

/** Change a project's name, or the date work started on it. */
export function useRenameProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      name,
      startedOn,
    }: {
      id: string;
      name: string;
      startedOn?: string;
    }): Promise<Project> => {
      const { data, error } = await supabase.rpc('rename_project', {
        p_id: id,
        p_name: name,
        p_started_on: startedOn ?? undefined,
      });
      if (error) throw new Error(error.message);
      return data as unknown as Project;
    },
    onSuccess: () => refreshTheBooks(qc),
  });
}

/**
 * Remove a project. The database refuses the moment anything has ever
 * been put on it, so this only ever removes a name typed by mistake.
 */
export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.rpc('delete_project', { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refreshTheBooks(qc),
  });
}

/** Who has been put on this site, and what each of them spent on it. */
export function useProjectCrew(projectId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['projects', 'crew', projectId],
    enabled: enabled && !!projectId,
    queryFn: async (): Promise<ProjectCrewMember[]> => {
      const { data, error } = await supabase.rpc('project_crew', { p_project_id: projectId! });
      if (error) throw new Error(error.message);
      return (data ?? []) as ProjectCrewMember[];
    },
  });
}

/** Put somebody on a site, or take them off it. */
export function useSetProjectMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      personId,
      on,
    }: {
      projectId: string;
      personId: string;
      on: boolean;
    }): Promise<void> => {
      const { error } = await supabase.rpc(on ? 'add_to_project' : 'remove_from_project', {
        p_project_id: projectId,
        p_person_id: personId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refreshTheBooks(qc),
  });
}
