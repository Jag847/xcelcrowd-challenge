import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

const STALE_TIME = 2000;
const REFETCH_INTERVAL = 5000;

const pollingQueryOptions = {
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
    staleTime: STALE_TIME
};

export const useJobs = () => {
    return useQuery({
        queryKey: ['jobs'],
        queryFn: async () => {
            const { data } = await api.get('/jobs');
            return data;
        },
        ...pollingQueryOptions
    });
};

export const usePipeline = (jobId) => {
    return useQuery({
        queryKey: ['pipeline', jobId],
        queryFn: async () => {
            if (!jobId) return [];
            const { data } = await api.get(`/jobs/${jobId}/applicants`);
            return data;
        },
        enabled: !!jobId,
        ...pollingQueryOptions
    });
};

export const useAuditLogs = (sinceId = 0) => {
    return useQuery({
        queryKey: ['auditLogs', sinceId],
        queryFn: async () => {
            const { data } = await api.get(`/audit-logs?since=${sinceId}`);
            return data;
        },
        ...pollingQueryOptions
    });
};

export const useApplicantPortfolio = () => {
    return useQuery({
        queryKey: ['applicantPortfolio'],
        queryFn: async () => {
            const { data } = await api.get('/applicants/me');
            return data;
        },
        ...pollingQueryOptions
    });
};

export const useApplicantStatus = (applicantId) => {
    return useQuery({
        queryKey: ['applicantStatus', applicantId],
        queryFn: async () => {
            if (!applicantId) return null;
            const { data } = await api.get(`/applicants/${applicantId}/status`);
            return data;
        },
        enabled: !!applicantId,
        ...pollingQueryOptions
    });
};

export const useMutateJob = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (payload) => {
            const { data } = await api.post('/jobs', payload);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['jobs'] });
        }
    });
};

export const useMutateExit = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (applicantId) => {
            const { data } = await api.post(`/applicants/${applicantId}/exit`);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['applicantPortfolio'] });
            queryClient.invalidateQueries({ queryKey: ['applicantStatus'] });
            queryClient.invalidateQueries({ queryKey: ['pipeline'] });
            queryClient.invalidateQueries({ queryKey: ['jobs'] });
        }
    });
};

export const useMutateApply = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ jobId, email }) => {
            const { data } = await api.post(`/jobs/${jobId}/apply`, { email });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['applicantPortfolio'] });
            queryClient.invalidateQueries({ queryKey: ['applicantStatus'] });
            queryClient.invalidateQueries({ queryKey: ['pipeline'] });
            queryClient.invalidateQueries({ queryKey: ['jobs'] });
        }
    });
};

export const useMutateAcknowledge = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (applicantId) => {
            const { data } = await api.post(`/applicants/${applicantId}/acknowledge`);
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['applicantPortfolio'] });
            queryClient.invalidateQueries({ queryKey: ['applicantStatus'] });
            queryClient.invalidateQueries({ queryKey: ['pipeline'] });
            queryClient.invalidateQueries({ queryKey: ['jobs'] });
        }
    });
};
