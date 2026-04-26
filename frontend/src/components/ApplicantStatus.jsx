import { useState, useEffect } from 'react';
import api from '../api';
import { useCountdown } from '../hooks/useCountdown';
import { Search, CheckCircle, ArrowRight, Briefcase, Plus, Activity, Trophy, Star } from 'lucide-react';

export default function ApplicantStatus() {
    const [id, setId] = useState('');
    const [status, setStatus] = useState(null);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [appliedJobIds, setAppliedJobIds] = useState(new Set());
    
    // Shared countdown
    const { timeLeft, isCritical } = useCountdown(status?.status === 'PENDING_ACK' ? status.last_transition_at : null);

    // E2E Flow Forms State
    const [jobs, setJobs] = useState([]);
    const [myApps, setMyApps] = useState([]);
    const [acceptedApps, setAcceptedApps] = useState([]);
    const [applyJobId, setApplyJobId] = useState('');
    const [isApplying, setIsApplying] = useState(false);
    const [showApplyForm, setShowApplyForm] = useState(false);

    // Fetch live jobs and personal applications immediately
    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        try {
            const jobsRes = await api.get('/jobs');
            setJobs(jobsRes.data);
            if (jobsRes.data.length > 0) setApplyJobId(jobsRes.data[0].id);

            const authRole = localStorage.getItem('role');
            if (authRole === 'APPLICANT') {
                const meRes = await api.get('/applicants/me');
                const apps = meRes.data.filter(app => app.status !== 'EXITED');
                setMyApps(apps);
                setAppliedJobIds(new Set(apps.map(app => app.job_id)));
                
                const accepted = meRes.data.filter(app => app.status === 'ACTIVE');
                setAcceptedApps(accepted);
                
                if (apps.length === 0) {
                    setShowApplyForm(true);
                } else if (!status) {
                    checkStatus(apps[0].id);
                }
            }
        } catch (err) {
            console.error('Error fetching data:', err);
            setShowApplyForm(true);
        }
    };

    const handleApply = async (e) => {
        e.preventDefault();
        if (!applyJobId) return;
        setIsApplying(true);
        setError('');
        setSuccessMsg('');
        try {
            const res = await api.post(`/jobs/${applyJobId}/apply`);
            if (res.data.alreadyApplied) {
                setSuccessMsg(`You already have an active application for this position.`);
                await fetchInitialData();
                setShowApplyForm(false);
            } else {
                const newId = res.data.id;
                setId(newId);
                setSuccessMsg('Application submitted successfully!');
                await fetchInitialData();
                setShowApplyForm(false);
                await checkStatus(newId);
            }
        } catch (e) {
            setError(e.response?.data?.error || "Failed to submit application");
        } finally {
            setIsApplying(false);
        }
    };

    const checkStatus = async (lookupId = id) => {
        if (!lookupId) return;
        setId(lookupId);
        try {
            setError('');
            const res = await api.get(`/applicants/${lookupId}/status`);
            setStatus(res.data);
        } catch (e) {
            setError(e.response?.data?.error || "Applicant ID not found.");
            setStatus(null);
        }
    };



    return (
        <div className="max-w-6xl mx-auto space-y-8">
            {/* ACCEPTED JOBS SECTION */}
            {acceptedApps.length > 0 && (
                <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 rounded-xl shadow-xl border border-emerald-500 overflow-hidden">
                    <div className="bg-emerald-800 px-6 py-4 border-b border-emerald-700 flex items-center gap-3">
                        <Trophy size={22} className="text-yellow-300" />
                        <h2 className="text-xl font-bold text-white">Accepted Jobs</h2>
                        <span className="ml-auto bg-yellow-400 text-emerald-900 px-3 py-1 rounded-full text-sm font-black">
                            {acceptedApps.length} Accepted
                        </span>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {acceptedApps.map(app => (
                            <div key={app.id} className="bg-emerald-900/50 border border-emerald-500/50 rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Star size={16} className="text-yellow-400 fill-yellow-400" />
                                    <h3 className="font-bold text-white">{app.job_title}</h3>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="inline-flex items-center rounded px-2.5 py-1 text-xs font-black uppercase bg-emerald-200 text-emerald-800">
                                        ACTIVE
                                    </span>
                                    <button 
                                        onClick={() => checkStatus(app.id)}
                                        className="text-xs text-emerald-300 hover:text-white font-semibold underline"
                                    >
                                        View Details
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                
                {/* 1. LEFT PANE: Portfolio & Applications */}
                <div className="bg-slate-800 rounded-xl shadow-xl border border-slate-700 overflow-hidden text-white flex flex-col h-[650px]">
                    <div className="bg-slate-900 px-6 py-5 border-b border-slate-800 flex justify-between items-center">
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            <Briefcase size={18} className="text-indigo-400" />
                            My Applications
                        </h2>
                        {!showApplyForm && (
                            <button 
                                onClick={() => setShowApplyForm(true)}
                                className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded flex items-center gap-1 font-bold transition-colors"
                            >
                                <Plus size={14} /> New
                            </button>
                        )}
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                        {showApplyForm ? (
                            <form onSubmit={handleApply} className="flex flex-col justify-center space-y-4 h-full">
                                {successMsg && (
                                    <div className="text-center p-3 bg-emerald-900/50 border border-emerald-700 rounded-lg">
                                        <p className="text-emerald-400 text-sm font-bold">{successMsg}</p>
                                    </div>
                                )}
                                {myApps.length === 0 && !successMsg && (
                                    <div className="text-center pb-4">
                                        <p className="text-slate-400 text-sm italic">You haven't applied to any jobs yet.</p>
                                    </div>
                                )}
                                {jobs.length === 0 ? (
                                    <div className="text-center py-8 bg-slate-800/50 rounded-lg border border-slate-700">
                                        <p className="text-slate-400 text-sm">No positions currently open.</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="bg-slate-900/50 p-5 rounded-lg border border-slate-700/50 space-y-4 shadow-inner">
                                            <div>
                                                <label className="block text-sm font-semibold text-slate-300 mb-2">Select Live Position</label>
                                                <select 
                                                    value={applyJobId} 
                                                    onChange={e => setApplyJobId(e.target.value)}
                                                    className="w-full bg-slate-800 border border-slate-600 rounded-lg text-sm text-white px-3 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                                                >
                                                    {jobs.map(j => (
                                                        <option 
                                                            key={j.id} 
                                                            value={j.id}
                                                            disabled={appliedJobIds.has(j.id)}
                                                        >
                                                            {j.title} {appliedJobIds.has(j.id) ? '(Already Applied)' : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                                {appliedJobIds.size > 0 && (
                                                    <p className="mt-2 text-xs text-amber-400">Jobs you already applied to are disabled.</p>
                                                )}
                                            </div>
                                            <button 
                                                type="submit" 
                                                disabled={isApplying}
                                                className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 font-bold py-3 rounded-lg shadow transition-colors disabled:opacity-50"
                                            >
                                                {isApplying ? 'Executing transaction...' : 'Apply Now'}
                                            </button>
                                        </div>
                                        {myApps.length > 0 && (
                                            <button 
                                                type="button"
                                                onClick={() => setShowApplyForm(false)}
                                                className="w-full text-center text-sm font-bold text-slate-400 hover:text-white py-2"
                                            >
                                                Cancel
                                            </button>
                                        )}
                                    </>
                                )}
                            </form>
                        ) : (
                            <div className="space-y-3">
                                {myApps.map(app => (
                                    <div 
                                        key={app.id} 
                                        onClick={() => checkStatus(app.id)}
                                        className={`cursor-pointer bg-slate-800 border rounded-lg p-4 transition-all duration-200 shadow-sm ${status?.id === app.id ? 'border-indigo-400 ring-1 ring-indigo-400 bg-slate-700' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-700/50'}`}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="font-bold text-slate-100">{app.job_title}</h3>
                                            </div>
                                            <span className={`inline-flex items-center rounded px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${app.status === 'ACTIVE' ? 'bg-emerald-900 text-emerald-400 border border-emerald-800' : app.status === 'PENDING_ACK' ? 'bg-amber-900/80 text-amber-400 border border-amber-700 animate-pulse' : app.status === 'EXITED' ? 'bg-slate-900 text-slate-500' : 'bg-indigo-900/50 text-indigo-300 border border-indigo-800'}`}>
                                                {app.status}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                {myApps.length === 0 && !showApplyForm && (
                                    <div className="text-center py-8 text-slate-500">
                                        <p className="text-sm">No active applications.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* 2. RIGHT PANE: TRACKER COMPONENT */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[650px]">
                    <div className="bg-indigo-600 px-6 py-5 border-b border-indigo-700">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Activity size={18} className="text-indigo-200" />
                            Live Status Tracker
                        </h2>
                    </div>
                    {/* Manual Override Fallback */}
                    <div className="p-4 border-b border-slate-100 bg-slate-50">
                        <div className="flex gap-2">
                            <input 
                                className="w-full flex-1 rounded text-slate-900 border border-slate-300 py-2 px-3 focus:ring-2 focus:ring-indigo-600 focus:border-transparent sm:text-sm font-mono text-xs shadow-inner" 
                                placeholder="Manual tracking UUID lookup..." 
                                value={id}
                                onChange={e => setId(e.target.value)}
                            />
                            <button 
                                className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 px-4 rounded shadow-sm transition-colors text-sm" 
                                onClick={() => checkStatus(id)}
                            >
                                Lookup
                            </button>
                        </div>
                        {error && <p className="mt-3 text-xs text-red-600 font-bold bg-red-50 p-2 border border-red-100 rounded">{error}</p>}
                    </div>

                    {!status ? (
                         <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                            <Search size={48} className="mb-4 opacity-20"/>
                            <p className="font-semibold text-sm text-slate-500">Select an application from your portfolio.</p>
                        </div>
                    ) : (
                        <div className="p-6 bg-white flex-1 overflow-y-auto custom-scrollbar">
                            <div className="mb-6">
                                <h3 className="text-3xl font-black text-slate-900 tracking-tight">{status.job_title}</h3>
                                <p className="text-sm font-bold text-indigo-500 mt-1 uppercase tracking-widest">{status.email}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-center border border-slate-200 py-6 mb-8 bg-slate-50 rounded-xl shadow-inner">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status Gate</p>
                                    <span className={`mt-2 inline-flex items-center rounded-md px-3 py-1.5 text-sm font-black uppercase tracking-widest shadow-sm border ${status.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : status.status === 'PENDING_ACK' ? 'bg-amber-100 text-amber-800 animate-pulse border-amber-300 ring-2 ring-amber-200' : status.status === 'EXITED' ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white text-slate-700 border-slate-200'}`}>
                                        {status.status}
                                    </span>
                                </div>
                                {status.position ? (
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Place In Line</p>
                                        <p className="mt-0.5 text-4xl font-black text-indigo-600">#{status.position}</p>
                                    </div>
                                ) : (
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Place In Line</p>
                                        <p className="mt-0.5 text-4xl font-black text-slate-300">-</p>
                                    </div>
                                )}
                            </div>

                            {status.status === 'PENDING_ACK' && (
                                <div className={`border-2 rounded-xl p-5 shadow-lg transition-colors mb-6 ${isCritical ? 'bg-red-50 border-red-400' : 'bg-amber-50 border-amber-300'}`}>
                                    <div className="flex">
                                        <div className="flex-shrink-0">
                                            <ArrowRight className={`h-6 w-6 mt-1 ${isCritical ? 'text-red-500' : 'text-amber-500'}`} aria-hidden="true" />
                                        </div>
                                        <div className="ml-3 w-full">
                                            <h3 className={`text-base font-black uppercase tracking-wide ${isCritical ? 'text-red-800' : 'text-amber-800'}`}>Action Required</h3>
                                            <div className={`mt-2 text-sm ${isCritical ? 'text-red-700' : 'text-amber-800'} font-medium`}>
                                                <p>Capacity slot opened! Exact time remaining:
                                                    <span className={`block mt-3 mb-1 text-2xl text-center font-mono font-black px-3 py-2 rounded-lg shadow-inner ${isCritical ? 'bg-red-200 text-red-900 animate-pulse' : 'bg-amber-200 text-amber-900'}`}>
                                                        {timeLeft || 'SYNCING...'}
                                                    </span> 
                                                </p>
                                            </div>
                                            <div className="mt-4">
                                                <button 
                                                    className={`w-full rounded-lg px-4 py-3 text-sm font-black uppercase tracking-widest text-white shadow transition-all hover:-translate-y-0.5 ${isCritical ? 'bg-red-600 hover:bg-red-500 animate-pulse ring-2 ring-red-400 ring-offset-2' : 'bg-amber-600 hover:bg-amber-500'}`}
                                                    onClick={async () => {
                                                        try {
                                                            await api.post(`/applicants/${status.id}/acknowledge`);
                                                            checkStatus(); 
                                                            fetchInitialData();
                                                        } catch (e) {
                                                            setError(e.response?.data?.error || "Error acknowledging");
                                                        }
                                                    }}
                                                >
                                                    Claim Spot Now
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {status.status === 'ACTIVE' && (
                                <div className="flex items-center gap-4 text-emerald-700 bg-emerald-50 rounded-xl p-5 border border-emerald-300 shadow-sm mb-6">
                                    <CheckCircle className="h-10 w-10 text-emerald-500" />
                                    <div>
                                        <span className="block font-black text-xl">Capacity Claimed</span>
                                        <span className="text-sm font-medium opacity-80">You officially hold an active spot in this job.</span>
                                    </div>
                                </div>
                            )}

                            {status.status !== 'EXITED' && (
                                <button 
                                    className="mt-4 w-full text-center text-xs font-bold text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border-red-200 uppercase tracking-widest transition-all border border-transparent rounded-lg py-4"
                                    onClick={async () => {
                                        if (window.confirm('Are you sure you want to withdraw your application? This will forfeit your spot and automatically trigger the priority promotion cascade to the next waitlisted applicant.')) {
                                            try {
                                                await api.post(`/applicants/${status.id}/exit`);
                                                checkStatus(); 
                                                fetchInitialData();
                                            } catch (e) {
                                                setError(e.response?.data?.error || "Error withdrawing");
                                            }
                                        }
                                    }}
                                >
                                    Withdraw Application & Forfeit Rank
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
