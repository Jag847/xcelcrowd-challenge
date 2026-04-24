import React, { useEffect, useState } from 'react';
import api from '../api';
import { Users, Clock, Plus } from 'lucide-react';

export default function CompanyDashboard() {
    const [jobs, setJobs] = useState([]);
    const [selectedJob, setSelectedJob] = useState(null);
    const [pipeline, setPipeline] = useState([]);

    const [newTitle, setNewTitle] = useState('');
    const [newCapacity, setNewCapacity] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        fetchJobs();
    }, []);

    const fetchJobs = async () => {
        try {
            const res = await api.get('/jobs');
            setJobs(res.data);
        } catch (e) {
            console.error('Error fetching jobs:', e);
        }
    };

    const fetchPipeline = async (jobId) => {
        try {
            const res = await api.get(`/jobs/${jobId}/applicants`);
            setPipeline(res.data);
            setSelectedJob(jobs.find(j => j.id === jobId));
        } catch (e) {
            console.error('Error fetching pipeline:', e);
        }
    };

    const handleCreateJob = async (e) => {
        e.preventDefault();
        if (!newTitle || !newCapacity) return;
        setIsCreating(true);
        try {
            await api.post('/jobs', { title: newTitle, capacity: parseInt(newCapacity) });
            setNewTitle('');
            setNewCapacity('');
            fetchJobs();
        } catch (err) {
            console.error('Error creating job', err);
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h2 className="text-xl font-bold text-slate-800">Live Hiring Pipelines</h2>
                <button 
                  onClick={fetchJobs} 
                  className="text-sm bg-white border shadow-sm hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-md font-semibold transition"
                >Refresh Status</button>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Jobs List / Overview */}
                <div className="md:col-span-1 flex flex-col gap-5">
                    
                    {/* The "Create Job" Interactive E2E Flow */}
                    <form onSubmit={handleCreateJob} className="bg-indigo-50 p-5 border border-indigo-100 rounded-xl shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="bg-indigo-200 p-1 rounded">
                                <Plus size={16} className="text-indigo-800" />
                            </div>
                            <h3 className="text-sm font-bold text-indigo-900 uppercase tracking-wide">Open New Position</h3>
                        </div>
                        <div className="space-y-3">
                            <input type="text" placeholder="Job Title (e.g. Lead Engineer)" value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full text-sm border-0 ring-1 ring-inset ring-slate-300 rounded-md py-2.5 px-3 shadow-sm focus:ring-2 focus:ring-indigo-600" required />
                            <div className="flex gap-2">
                                <input type="number" placeholder="Capacity" min="1" value={newCapacity} onChange={e => setNewCapacity(e.target.value)} className="w-24 text-sm border-0 ring-1 ring-inset ring-slate-300 rounded-md py-2.5 px-3 shadow-sm focus:ring-2 focus:ring-indigo-600" required />
                                <button type="submit" disabled={isCreating} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-md py-2.5 shadow transition disabled:opacity-50">Create Job</button>
                            </div>
                        </div>
                    </form>

                    <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                        {jobs.length === 0 && <p className="text-sm text-slate-500 italic px-2">No active jobs exist.</p>}
                        
                        {jobs.map(job => {
                            const fillPercentage = Math.min((job.activeCount / job.capacity) * 100, 100);
                            return (
                            <div 
                                key={job.id} 
                                onClick={() => fetchPipeline(job.id)}
                                className={`cursor-pointer rounded-xl p-5 border transition-all duration-200 ${selectedJob?.id === job.id ? 'border-indigo-500 ring-2 ring-indigo-500 shadow-md bg-indigo-50/10' : 'border-slate-200 hover:border-slate-300 hover:shadow-md bg-white'}`}
                            >
                                <h3 className="font-bold text-slate-800 text-lg">{job.title}</h3>
                                <div className="mt-4">
                                    <div className="flex justify-between text-xs mb-1.5">
                                        <span className="text-slate-500 font-bold uppercase tracking-widest">Capacity</span>
                                        <span className="font-black text-slate-700">{job.activeCount} / {job.capacity} Filled</span>
                                    </div>
                                    <div className="w-full bg-slate-100 rounded-full h-2 border border-slate-200 overflow-hidden">
                                        <div className="bg-indigo-500 h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${fillPercentage}%` }}></div>
                                    </div>
                                </div>
                                <div className="mt-5 flex items-center justify-between text-xs font-bold text-slate-600">
                                    <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-md border border-emerald-100 shadow-sm">
                                        <Users size={14} className="text-emerald-500"/>
                                        <span>{job.activeCount} Active</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-md border border-amber-100 shadow-sm">
                                        <Clock size={14} className="text-amber-500"/>
                                        <span>{job.waitlistCount} Waiting</span>
                                    </div>
                                </div>
                            </div>
                        )})}
                    </div>
                </div>

                {/* Live Pipeline View */}
                <div className="md:col-span-2 bg-slate-50 rounded-xl border border-slate-200 p-6 shadow-inner min-h-[500px]">
                    {!selectedJob ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                            <Users size={64} className="mb-4 opacity-20"/>
                            <p className="font-semibold text-lg text-slate-500">Select an active job to monitor its pipeline.</p>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col">
                            <div className="flex justify-between items-center border-b-2 border-slate-200 pb-4 mb-5">
                                <div>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Live Feed</p>
                                    <h3 className="text-2xl font-black text-slate-800">{selectedJob.title}</h3>
                                </div>
                                <button 
                                    onClick={() => fetchPipeline(selectedJob.id)} 
                                    className="bg-white px-4 py-2 rounded-md shadow-sm border border-slate-200 text-sm font-bold text-indigo-600 hover:bg-slate-50 transition"
                                >
                                    Refresh Feed
                                </button>
                            </div>
                            
                            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar flex-1">
                                {pipeline.length === 0 ? (
                                    <div className="flex justify-center items-center h-full">
                                        <p className="text-slate-500 font-medium">No applicants have applied for this position yet.</p>
                                    </div>
                                ) : pipeline.map((app, idx) => (
                                    <div key={app.id} className={`flex items-center justify-between bg-white px-5 py-4 rounded-xl shadow-sm border transition-all ${app.status === 'PENDING_ACK' ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200'}`}>
                                        <div className="flex items-center gap-5">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shadow-inner ${app.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : app.status === 'PENDING_ACK' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                                #{idx + 1}
                                            </div>
                                            <div>
                                                <p className="text-base font-bold text-slate-900">{app.email}</p>
                                                <p className="text-xs text-slate-400 font-mono mt-1 opacity-70 border bg-slate-50 inline-block px-2 py-0.5 rounded">{app.id}</p>
                                            </div>
                                        </div>
                                        <div>
                                            <span className={`inline-flex items-center rounded-md px-3 py-1.5 text-xs font-black uppercase tracking-widest shadow-sm ${app.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : app.status === 'PENDING_ACK' ? 'bg-amber-50 text-amber-700 border border-amber-300 animate-pulse' : 'bg-slate-50 text-slate-600 border border-slate-200'}`}>
                                                {app.status}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
