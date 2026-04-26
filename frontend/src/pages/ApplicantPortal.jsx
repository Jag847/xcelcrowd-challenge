import React, { useState, useEffect } from 'react';
import { useApplicantPortfolio, useApplicantStatus, useJobs, useMutateAcknowledge, useMutateApply, useMutateExit } from '../hooks/useNextInLine';
import { useCountdown } from '../hooks/useCountdown';
import { CheckCircle, Search, Briefcase, Zap, AlertTriangle } from 'lucide-react';

const Stepper = ({ status }) => {
    const steps = [
        { id: 'WAITLISTED', label: 'Queued' },
        { id: 'PENDING_ACK', label: 'Decay SLA' },
        { id: 'ACTIVE', label: 'Active Pipeline' },
    ];

    let currentIdx = steps.findIndex(s => s.id === status);
    if (status === 'EXITED') currentIdx = -1;

    return (
        <div className="flex items-center w-full max-w-lg mx-auto py-6">
            {steps.map((step, idx) => {
                const isActive = idx === currentIdx;
                const isPast = idx < currentIdx;
                
                return (
                    <React.Fragment key={step.id}>
                        <div className="flex flex-col items-center relative">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs z-10 transition-colors 
                                ${isActive ? 'bg-indigo-600 text-white ring-4 ring-indigo-100' : 
                                  isPast ? 'bg-emerald-500 text-white' : 
                                  'bg-zinc-200 text-zinc-400'}`}
                            >
                                {isPast ? <CheckCircle size={14} /> : idx + 1}
                            </div>
                            <div className={`absolute top-10 text-[10px] uppercase tracking-wider font-semibold 
                                ${isActive ? 'text-indigo-600' : isPast ? 'text-emerald-600' : 'text-zinc-400'}`}>
                                {step.label}
                            </div>
                        </div>
                        {idx < steps.length - 1 && (
                            <div className={`flex-grow h-0.5 transition-colors ${isPast ? 'bg-emerald-500' : 'bg-zinc-200'}`}></div>
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

const DecayClock = ({ transitionAt, onExpire }) => {
    const { timeLeft, isCritical } = useCountdown(transitionAt, onExpire);

    return (
        <div className={`font-mono text-4xl font-bold tracking-tighter transition-colors duration-500 ${isCritical ? 'text-red-600 animate-pulse' : 'text-indigo-600'}`}>
            {timeLeft}
        </div>
    );
};

export const ApplicantPortal = ({ onLogout }) => {
    const { data: portfolio } = useApplicantPortfolio();
    const { data: jobs } = useJobs();
    const apply = useMutateApply();
    const acknowledge = useMutateAcknowledge();
    const exitApp = useMutateExit();

    const [selectedId, setSelectedId] = useState(null);
    const { data: details } = useApplicantStatus(selectedId);
    const activeApplications = (portfolio || []).filter((application) => application.status !== 'EXITED');
    const activeJobIds = new Set(activeApplications.map((application) => application.job_id));

    // Initial select
    useEffect(() => {
        if (!activeApplications.length) {
            setSelectedId(null);
            return;
        }

        const selectedStillExists = activeApplications.some((application) => application.id === selectedId);
        if (!selectedStillExists) {
            setSelectedId(activeApplications[0].id);
        }
    }, [activeApplications, selectedId]);

    const handleApply = async (jobId) => {
        try {
            const result = await apply.mutateAsync({ jobId, email: undefined });
            setSelectedId(result.id);
            alert(result.alreadyApplied ? 'You already have an active application for this job.' : 'Application submitted successfully!');
        } catch(err) {
            alert(err.response?.data?.error || err.response?.data?.details?.[0]?.message || 'An error occurred during application.');
        }
    };

    return (
        <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 selection:bg-indigo-100">
             <header className="bg-white border-b border-zinc-200 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-zinc-900 rounded-full flex items-center justify-center">
                            <Zap size={14} className="text-white fill-white" />
                        </div>
                        <h1 className="font-bold tracking-tight text-zinc-900">Applicant Portal</h1>
                    </div>
                    <button onClick={onLogout} className="text-zinc-500 hover:text-zinc-800 text-sm font-medium transition">
                        Sign out
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8">
                
                <div className="mb-12">
                    <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Briefcase className="text-indigo-600" size={20}/> Open Cohorts</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {jobs?.map(job => (
                            <div key={job.id} className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm flex flex-col justify-between hover:shadow-md transition">
                                <div>
                                    <h3 className="font-semibold text-lg text-zinc-800">{job.title}</h3>
                                    <div className="text-sm text-zinc-500 mt-2">Active review slots: {job.activeCount}/{job.capacity}</div>
                                    <div className="text-xs text-zinc-400 mt-1">Waitlist depth: {job.waitlistCount}</div>
                                </div>
                                <button 
                                    onClick={() => handleApply(job.id)}
                                    disabled={activeJobIds.has(job.id) || apply.isPending}
                                    className="mt-6 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 disabled:text-zinc-500 text-white font-medium py-2 rounded-xl text-sm transition"
                                >
                                    {activeJobIds.has(job.id) ? 'Already Applied' : apply.isPending ? 'Submitting...' : 'Queue Registration'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                <hr className="border-zinc-200 mb-12" />

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                     <div className="lg:col-span-1 space-y-2">
                        <h2 className="text-sm font-bold tracking-wider uppercase text-zinc-400 mb-4">Your Applications</h2>
                        {activeApplications.length === 0 && (
                            <div className="text-zinc-500 text-sm italic">You have no active registrations.</div>
                        )}
                        {activeApplications.map(app => (
                            <button
                                key={app.id}
                                onClick={() => setSelectedId(app.id)}
                                className={`w-full text-left p-4 rounded-xl border transition-all ${selectedId === app.id ? 'bg-white border-zinc-900 shadow-md ring-1 ring-zinc-900' : 'bg-white border-zinc-200 hover:border-zinc-300 shadow-sm'}`}
                            >
                                <div className="font-semibold text-sm truncate">{app.job_title}</div>
                                <div className="text-xs text-zinc-500 mt-1">
                                    Last updated {new Date(app.last_transition_at).toLocaleDateString()}
                                </div>
                                <div className={`text-[10px] font-bold uppercase mt-3 inline-block px-2 py-0.5 rounded-full
                                    ${app.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 
                                      app.status === 'PENDING_ACK' ? 'bg-amber-100 text-amber-700' : 
                                      app.status === 'WAITLISTED' ? 'bg-indigo-100 text-indigo-700' : 'bg-zinc-100 text-zinc-600'}`}>
                                    {app.status}
                                </div>
                            </button>
                        ))}
                     </div>

                     <div className="lg:col-span-3">
                         {details ? (
                             <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-10 flex flex-col items-center">
                                 <h2 className="text-3xl font-bold text-zinc-900 mb-2">{details.job_title}</h2>
                                 <p className="text-zinc-500 mb-12">Tracking ID: {details.id}</p>

                                 <div className="w-full mb-16">
                                     <Stepper status={details.status} />
                                 </div>

                                 {details.status === 'WAITLISTED' && (
                                     <div className="bg-indigo-50 border border-indigo-100 rounded-2xl w-full max-w-sm p-6 text-center">
                                         <Search className="mx-auto text-indigo-400 mb-2" size={32} />
                                         <div className="text-sm font-semibold text-indigo-800 uppercase tracking-widest mb-1">Queue Position</div>
                                         <div className="text-5xl font-black text-indigo-600 mb-2">{details.position}</div>
                                         <p className="text-xs text-indigo-500 uppercase font-semibold">Among waitlisted applicants</p>
                                     </div>
                                 )}

                                {details.status === 'PENDING_ACK' && (
                                     <div className="bg-amber-50 border border-amber-200 rounded-2xl w-full max-w-md p-8 text-center shadow-inner relative overflow-hidden">
                                         <div className="absolute top-0 left-0 w-full h-1 bg-amber-400"></div>
                                         <AlertTriangle className="mx-auto text-amber-500 mb-4" size={40} />
                                         <h3 className="text-xl font-bold text-amber-900 mb-2">High-Priority Action Required</h3>
                                         <p className="text-sm text-amber-700 mb-6">A capacity slot has opened. You must claim your spot before the SLA window decays.</p>
                                         <DecayClock transitionAt={details.last_transition_at} />
                                         <button 
                                            onClick={async () => {
                                                await acknowledge.mutateAsync(details.id);
                                            }}
                                            disabled={acknowledge.isPending}
                                            className="mt-8 bg-amber-500 text-white px-8 py-3 rounded-full font-bold shadow-lg hover:bg-amber-600 hover:scale-105 transition-all w-full disabled:bg-amber-200 disabled:text-amber-700 disabled:hover:scale-100"
                                         >
                                             {acknowledge.isPending ? 'Confirming...' : 'Acknowledge Spot'}
                                         </button>
                                     </div>
                                 )}

                                {details.status === 'ACTIVE' && (
                                     <div className="bg-emerald-50 border border-emerald-100 rounded-2xl w-full max-w-sm p-6 text-center shadow-inner">
                                         <CheckCircle className="mx-auto text-emerald-500 mb-4" size={48} />
                                         <h3 className="text-2xl font-bold text-emerald-900 mb-2">Registration Secured</h3>
                                         <p className="text-sm text-emerald-700">You hold an active position in this cohort's pipeline.</p>
                                     </div>
                                 )}

                                {details.status !== 'EXITED' && (
                                     <button 
                                        onClick={async () => {
                                            if(window.confirm('Withdrawing will forfeit your priority and trigger an automatic cascade for the next queued applicant. Proceed?')) {
                                                await exitApp.mutateAsync(details.id);
                                            }
                                        }}
                                        disabled={exitApp.isPending}
                                        className="mt-16 text-xs font-semibold text-zinc-400 hover:text-rose-600 uppercase tracking-widest transition"
                                     >
                                        {exitApp.isPending ? 'Updating Pipeline...' : 'Abandon Registration Request'}
                                     </button>
                                )}
                             </div>
                         ) : (
                             <div className="flex items-center justify-center h-[500px] border border-dashed border-zinc-200 rounded-3xl">
                                 <p className="text-zinc-400 italic">Select an application to view telemetry.</p>
                             </div>
                         )}
                     </div>
                </div>

            </main>

        </div>
    );
};
