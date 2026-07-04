import { useCallback } from 'react';
import api from '@/lib/axios';
import useWorkflowStore from '@/store/workflowStore';

export function useWorkflow() {
  const { setWorkflow } = useWorkflowStore();

  const loadWorkflow = useCallback(async (id) => {
    const { data } = await api.get(`/workflows/${id}`);
    setWorkflow(data.workflow);
    return data.workflow;
  }, [setWorkflow]);

  const saveWorkflow = useCallback(async (id, { nodes, edges, name }) => {
    const { data } = await api.put(`/workflows/${id}`, { nodes, edges, name });
    return data.workflow;
  }, []);

  return { loadWorkflow, saveWorkflow };
}
