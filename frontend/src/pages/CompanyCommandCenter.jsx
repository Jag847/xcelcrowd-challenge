import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Search, LogOut, CheckCircle, Clock, Plus, Trash2 } from 'lucide-react';
import { useJobs, usePipeline, useAuditLogs, useMutateJob, useMutateExit } from '../hooks/useNextInLine';

const LockVisualizer = ({ isActive }) => {
    return (
        <AnimatePresence>
            {isActive && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-2 bg-rose-100 text-rose-600 px-3 py-1 rounded-md text-xs font-semibold mr-4 shadow-sm"
                >
                    <Lock size={12} className="animate-pulse" /> Locking Pipeline...
                </motion.div>
            )}
        </AnimatePresence>
    );
};

const AuditLogTerminal = () => {
    const [latestId, setLatestId] = useState(0);
    const [logs, setLogs] = useState([]);
    
    // Poll the delta since the last known ID
    const { data: deltaLogs } = useAuditLogs(latestId);

    const logsEndRef = useRef(null);

    useEffect(() => {
        if (deltaLogs && deltaLogs.length > 0) {
            // Filter out logs we might already have to be uniquely safe, then prepend or append based on sort.
            // The API returns ordered by ID DESC string (newest first). 
            // We want to accumulate them.
            setLogs(prev => {
                const newIds = new Set(prev.map(l => Number(l.id)));
                const uniqueNew = deltaLogs.filter(l => !newIds.has(Number(l.id)));
                // Reverse because we want newest at bottom (like a terminal)
                const arranged = uniqueNew.reverse(); 
                return [...prev, ...arranged].slice(-100); // keep last 100
            });
            // Update highest ID
            const highestNew = Math.max(...deltaLogs.map(l => Number(l.id)));
            if (highestNew > latestId) setLatestId(highestNew);
        }
    }, [deltaLogs, latestId]);

    // Auto-scroll terminal
    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    return (
        <div className="bg-zinc-950 text-zinc-300 font-mono text-xs p-4 rounded-xl shadow-xl border border-zinc-800 h-64 overflow-y-auto w-full mt-8">
            <div className="flex items-center justify-between mb-4 border-b border-zinc-800 pb-2">
                <div className="text-zinc-500 font-semibold tracking-wider text-[10px] uppercase flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Audit Log Terminal
                </div>
            </div>
            {logs.length === 0 ? (
                <div className="text-zinc-600 italic">No transitions recorded...</div>
            ) : (
                logs.map(log => (
                    <div key={log.id} className="mb-2 hover:bg-zinc-900 px-2 py-1 rounded transition">
                        <span className="text-zinc-500">[{new Date(log.created_at).toLocaleTimeString()}]</span>{' '}
                        <span className="text-indigo-400">{log.email}</span>{' '}
                        <span className="text-zinc-400">triggered</span>{' '}
                        <span className="text-yellow-500">{log.trigger}</span>:{' '}
                        <span className="text-zinc-400">{log.from_status || 'NULL'} -> </span>
                        <span className="text-emerald-400 font-semibold">{log.to_status}</span>
                    </div>
                ))
            )}
            <div ref={logsEndRef} />
        </div>
    );
};

export const CompanyCommandCenter = ({ onLogout }) => {
    const { data: jobs } = useJobs();
    const [selectedJob, setSelectedJob] = useState('');
    const { data: pipeline } = usePipeline(selectedJob);
    const createJob = useMutateJob();
    const exitApp = useMutateExit();
    const [isLocking, setIsLocking] = useState(false);

    const [title, setTitle] = useState('');
    const [capacity, setCapacity] = useState(1);

    useEffect(() => {
        if (!jobs?.length) {
            setSelectedJob('');
            return;
        }

        const selectedStillExists = jobs.some((job) => job.id === selectedJob);
        if (!selectedStillExists) {
            setSelectedJob(jobs[0].id);
        }
    }, [jobs, selectedJob]);

    const handleCreateJob = async (e) => {
        e.preventDefault();
        try {
            await createJob.mutateAsync({ title, capacity: Number(capacity) });
            setTitle('');
            setCapacity(1);
        } catch(err) {
            alert(err.response?.data?.error || 'Failed to create the job opening.');
        }
    };

    const handleExit = async (id) => {
        setIsLocking(true);
        try {
            await exitApp.mutateAsync(id);
        } catch(err) {
            alert(err.response?.data?.error || 'Failed to update the applicant state.');
        } 
        finally {
            setTimeout(() => setIsLocking(false), 500); // hold lock visualizer
        }
    };

    const activeList = pipeline?.filter(a => ['ACTIVE', 'PENDING_ACK'].includes(a.status)) || [];
    const waitlistList = pipeline?.filter(a => a.status === 'WAITLISTED') || [];

    return (
        <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 selection:bg-indigo-100">
            {/* Nav */}
            <header className="bg-white border-b border-zinc-200 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-indigo-600 rounded-md"></div>
                        <h1 className="font-bold tracking-tight text-zinc-900">Next In Line Workspace</h1>
                        <span className="bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider ml-2 border border-zinc-200">Admin</span>
                    </div>
                    <button onClick={onLogout} className="text-zinc-500 hover:text-zinc-800 flex items-center gap-2 text-sm font-medium transition">
                        <LogOut size={16} /> Sign out
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8">
                {/* Header Context */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                    <div>
                        <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 mb-2">Command Center</h2>
                        <p className="text-zinc-500 text-sm max-w-2xl">Manage strict capacities, orchestrate high-concurrency waitlists, and monitor the append-only audit trail. Views refresh every five seconds by design.</p>
                    </div>
                    
                    <form onSubmit={handleCreateJob} className="flex items-center gap-3 bg-white p-2 rounded-xl shadow-sm border border-zinc-200">
                        <input type="text" placeholder="Algorithm Engineer" value={title} onChange={(e)=>setTitle(e.target.value)} required className="text-sm outline-none px-3 py-1.5 w-48 bg-transparent" />
                        <div className="w-px h-6 bg-zinc-200"></div>
                        <input type="number" min="1" value={capacity} onChange={(e)=>setCapacity(e.target.value)} required className="text-sm outline-none px-3 py-1.5 w-20 bg-transparent" />
                        <button type="submit" disabled={createJob.isPending} className="bg-zinc-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-zinc-800 disabled:bg-zinc-300 disabled:text-zinc-500 transition flex items-center gap-2">
                           <Plus size={16} /> Create Pool
                        </button>
                    </form>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Left sidebar: Job Selection */}
                    <div className="lg:col-span-1 space-y-3">
                        <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Active Pools</div>
                        {jobs?.length === 0 ? (
                             <div className="text-sm text-zinc-500 p-4 bg-zinc-100 rounded-xl border border-zinc-200 border-dashed">No active pools initialized.</div>
                        ) : jobs?.map(job => (
                            <button
                                key={job.id}
                                onClick={() => setSelectedJob(job.id)}
                                className={`w-full text-left p-4 rounded-xl border transition-all ${selectedJob === job.id ? 'bg-white border-indigo-600 shadow-md ring-1 ring-indigo-600' : 'bg-white border-zinc-200 hover:border-zinc-300 shadow-sm'}`}
                            >
                                <div className="font-semibold text-sm truncate">{job.title}</div>
                                <div className="text-xs text-zinc-500 mt-2 flex items-center justify-between">
                                    <span>Cap: {job.activeCount}/{job.capacity}</span>
                                    <span className="bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full">{job.waitlistCount} queued</span>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Right side: Pipeline Visualizer */}
                    <div className="lg:col-span-3 bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[600px]">
                        {!selectedJob ? (
                            <div className="flex-grow flex flex-col items-center justify-center text-zinc-400">
                                <Search size={40} className="mb-4 stroke-1" />
                                <p>Select a job cohort to visualize the pipeline.</p>
                            </div>
                        ) : (
                            <>
                                <div className="p-4 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between shadow-inner">
                                    <h3 className="font-semibold text-zinc-800 flex items-center gap-2">
                                        Pipeline Monitor
                                    </h3>
                                    <LockVisualizer isActive={isLocking} />
                                </div>
                                <div className="flex-grow grid grid-cols-2 divide-x divide-zinc-200 overflow-hidden bg-zinc-50/50">
                                    
                                    {/* Active Pipeline */}
                                    <div className="p-4 overflow-y-auto">
                                        <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-6 flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Active Protocol
                                        </div>
                                        <div className="space-y-4">
                                            <AnimatePresence>
                                                {activeList.map((app) => (
                                                    <motion.div 
                                                        layout
                                                        layoutId={`card-${app.id}`}
                                                        initial={{ opacity: 0, x: -20 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        exit={{ opacity: 0, scale: 0.9 }}
                                                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                                                        key={app.id} 
                                                        className="bg-white border border-zinc-200 p-4 rounded-xl shadow-sm flex items-center justify-between"
                                                    >
                                                        <div>
                                                            <div className="text-sm font-semibold text-zinc-800 truncate max-w-[180px]">{app.email}</div>
                                                            <div className="text-xs text-zinc-500 mt-1 flex items-center gap-1.5">
                                                                {app.status === 'PENDING_ACK' ? <Clock size={12} className="text-amber-500" /> : <CheckCircle size={12} className="text-emerald-500" />}
                                                                {app.status === 'PENDING_ACK' ? 'Pending SLA Acknowledgement' : 'Locked & Active'}
                                                            </div>
                                                        </div>
                                                        <button 
                                                            onClick={() => handleExit(app.id)}
                                                            disabled={exitApp.isPending}
                                                            className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                                            title="Evict Candidate"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </motion.div>
                                                ))}
                                            </AnimatePresence>
                                            {activeList.length === 0 && (
                                                <div className="text-sm text-zinc-400 text-center mt-12 italic border border-dashed border-zinc-200 p-8 rounded-xl">Capacity fully open.</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Waitlist Pipeline */}
                                    <div className="p-4 overflow-y-auto bg-zinc-100/50">
                                         <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-6 flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-zinc-400"></span> Sequential Waitlist
                                        </div>
                                        <div className="space-y-4">
                                            <AnimatePresence>
                                                {waitlistList.map((app, idx) => (
                                                    <motion.div 
                                                        layout
                                                        layoutId={`card-${app.id}`}
                                                        initial={{ opacity: 0, x: 20 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        exit={{ opacity: 0, scale: 0.9 }}
                                                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                                                        key={app.id} 
                                                        className={`bg-white border p-4 rounded-xl shadow-sm flex items-center justify-between ${idx === 0 ? 'border-indigo-300 ring-2 ring-indigo-50 ring-offset-1' : 'border-zinc-200'}`}
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${idx === 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-zinc-100 text-zinc-500'}`}>
                                                                {idx + 1}
                                                            </div>
                                                            <div>
                                                                <div className="text-sm font-semibold text-zinc-800 truncate max-w-[150px]">{app.email}</div>
                                                                <div className="text-xs text-zinc-400 mt-1">Priority: {app.priority_score}</div>
                                                            </div>
                                                        </div>
                                                        <button 
                                                            onClick={() => handleExit(app.id)}
                                                            disabled={exitApp.isPending}
                                                            className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                                            title="Evict Candidate"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </motion.div>
                                                ))}
                                            </AnimatePresence>
                                            {waitlistList.length === 0 && (
                                                <div className="text-sm text-zinc-400 text-center mt-12 italic border border-dashed border-zinc-200 bg-white p-8 rounded-xl">No pending candidates in queue.</div>
                                            )}
                                        </div>
                                    </div>
                                    
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Audit Terminal */}
                <AuditLogTerminal />

            </main>
        </div>
    );
};
