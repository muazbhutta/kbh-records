import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Range } from '@/api/dashboard';
import type { PersonShare, Project, ProjectTotal } from '@/types';

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
        .select('id, name, note, is_active, created_by, created_at, closed_at')
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['entry-feed'] });
      qc.invalidateQueries({ queryKey: ['entry-recent'] });
      qc.invalidateQueries({ queryKey: ['entry'] });
    },
  });
}
