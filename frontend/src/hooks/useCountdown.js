import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook to handle decay countdown logic across different components.
 * @param {string} transitionAt - ISO timestamp of the last transition
 * @param {function} onExpire - Optional callback when timer hits zero
 * @param {number} windowHours - The SLA window in hours (default: 24)
 * @returns {object} { timeLeft, isCritical, expiryProgress }
 */
export const useCountdown = (transitionAt, onExpire, windowHours = 24) => {
    const [timeLeft, setTimeLeft] = useState('00:00:00');
    const [isCritical, setIsCritical] = useState(false);
    const [expiryProgress, setExpiryProgress] = useState(100);

    const calculate = useCallback(() => {
        if (!transitionAt) return;

        const windowMs = windowHours * 60 * 60 * 1000;
        const expiry = new Date(transitionAt).getTime() + windowMs;
        const now = new Date().getTime();
        const diff = expiry - now;

        if (diff <= 0) {
            setTimeLeft('00:00:00');
            setIsCritical(true);
            setExpiryProgress(0);
            if (onExpire) onExpire();
            return;
        }

        // Critical pulse starts at last 60 seconds
        setIsCritical(diff < 60000);
        setExpiryProgress((diff / windowMs) * 100);
        
        const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const m = Math.floor((diff / 1000 / 60) % 60);
        const s = Math.floor((diff / 1000) % 60);
        
        const formatted = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        setTimeLeft(formatted);
    }, [transitionAt, onExpire, windowHours]);

    useEffect(() => {
        calculate();
        const interval = setInterval(calculate, 1000);
        return () => clearInterval(interval);
    }, [calculate]);

    return { timeLeft, isCritical, expiryProgress };
};
