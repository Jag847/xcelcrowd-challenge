import React, { useState } from 'react';
import { CompanyCommandCenter } from './pages/CompanyCommandCenter';
import { ApplicantPortal } from './pages/ApplicantPortal';
import api from './api';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [role, setRole] = useState(localStorage.getItem('role'));
  const [loginEmail, setLoginEmail] = useState('');

  const login = async (selectedRole) => {
    if (selectedRole === 'APPLICANT' && !loginEmail) {
        alert("Please enter a valid email to mint your Applicant JWT.");
        return;
    }
    try {
      const res = await api.post('/auth/login', { role: selectedRole, email: loginEmail });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('role', res.data.role);
      setToken(res.data.token);
      setRole(res.data.role);
    } catch (err) {
      alert(err.response?.data?.error || 'Unable to sign in right now.');
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    setToken(null);
    setRole(null);
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center pointer-events-auto">
        <h1 className="text-4xl font-bold text-indigo-600 mb-4">Next In Line Auth Bridge</h1>
        <p className="text-slate-500 mb-8 max-w-md text-center">Simulated Role-Based Authentication Gateway. Select an identity to mint a secure JWT and proceed.</p>
        
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4 text-center">Identity Provider</h2>
            <div className="space-y-4">
                <button 
                    onClick={() => login('COMPANY_ADMIN')} 
                    className="w-full px-6 py-3 bg-indigo-600 text-white font-semibold rounded-md shadow hover:bg-indigo-700 transition"
                >
                    Enter as Company Admin
                </button>
                
                <div className="relative flex py-3 items-center">
                    <div className="flex-grow border-t border-slate-200"></div>
                    <span className="flex-shrink-0 mx-4 text-slate-400 text-sm">OR</span>
                    <div className="flex-grow border-t border-slate-200"></div>
                </div>

                <div className="space-y-2">
                    <input 
                        type="email" 
                        placeholder="your.email@domain.com"
                        value={loginEmail}
                        onChange={e => setLoginEmail(e.target.value)}
                        className="w-full text-sm border-0 ring-1 ring-inset ring-slate-300 rounded-md py-2.5 px-3 shadow-sm focus:ring-2 focus:ring-indigo-600"
                    />
                    <button 
                        onClick={() => login('APPLICANT')} 
                        className="w-full px-6 py-3 bg-white text-indigo-600 border border-indigo-600 font-semibold rounded-md shadow hover:bg-indigo-50 transition"
                    >
                        Enter as Applicant
                    </button>
                </div>
            </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-900 pointer-events-auto">
      <main>
          <section>
            {role === 'COMPANY_ADMIN' ? <CompanyCommandCenter onLogout={logout} /> : <ApplicantPortal onLogout={logout} />}
          </section>
      </main>
    </div>
  );
}

export default App;
