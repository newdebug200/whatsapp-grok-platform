import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import './AuthPage.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function AuthPage() {
  const { login, register } = useAuth();
  const { t } = useLanguage();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', name: '', code: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError('');
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    setNotice('');
  };

  const validate = () => {
    if (!form.email.trim()) return 'L\'email est requis';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Format d\'email invalide';
    if (mode === 'register' && !form.name.trim()) return 'Le nom est requis';
    if (mode === 'login' || mode === 'register') {
      if (!form.password) return 'Le mot de passe est requis';
      if (form.password.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères';
    }
    if (mode === 'forgot-confirm') {
      if (!/^\d{6}$/.test(form.code)) return 'Le code doit contenir 6 chiffres';
      if (form.newPassword.length < 8) return 'Le nouveau mot de passe doit contenir au moins 8 caractères';
      if (form.newPassword !== form.confirmPassword) return 'Les deux mots de passe ne correspondent pas';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else if (mode === 'register') {
        await register(form.email, form.password, form.name);
      } else if (mode === 'forgot-request') {
        const response = await axios.post(`${API_URL}/auth/reset-request`, { email: form.email });
        setNotice(response.data?.message || 'Si cet email existe, un code de récupération a été envoyé.');
        setMode('forgot-confirm');
      } else {
        const response = await axios.post(`${API_URL}/auth/reset-confirm`, {
          email: form.email, code: form.code, new_password: form.newPassword
        });
        setNotice(response.data?.message || 'Mot de passe réinitialisé avec succès.');
        setForm({ ...form, password: '', code: '', newPassword: '', confirmPassword: '' });
        setMode('login');
      }
    } catch (err) {
      const status = err.response?.status;
      const serverError = String(err.response?.data?.error || '').toLowerCase();
      if (!err.response) setError(t('The service is temporarily unavailable. Check your connection and try again.'));
      else if (status === 401) setError(t('The email or password is incorrect.'));
      else if (status === 502 || serverError.includes('api centrale') || serverError.includes('central api')) setError(t('We could not complete the request right now. Please try again shortly.'));
      else setError(err.response?.data?.error || t('Something went wrong. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const isAuthMode = mode === 'login' || mode === 'register';
  const title = mode === 'login' ? t('Welcome back') : mode === 'register' ? t('Get started with Botora') : mode === 'forgot-request' ? 'Mot de passe oublié ?' : 'Réinitialiser le mot de passe';
  const subtitle = mode === 'login' ? t('Access your workspace.') : mode === 'register' ? t('Create your workspace in seconds.') : mode === 'forgot-request' ? 'Recevez un code de récupération par e-mail.' : 'Saisissez le code reçu et choisissez un nouveau mot de passe.';

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo"><img src="/icons/icon-192.png" alt="Botora" className="auth-logo-img" /></div>
          <p className="auth-kicker">{t('SMART PLATFORM')}</p>
          <h1 className="auth-title">Botora</h1>
          <p className="auth-subtitle">{t('The intelligence behind your WhatsApp conversations')}</p>
        </div>
        <div className="auth-card">
          <div className="auth-card-heading"><h2>{title}</h2><p>{subtitle}</p></div>
          {isAuthMode && <div className="auth-tabs">
            <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => switchMode('login')}>{t('Login')}</button>
            <button className={`auth-tab ${mode === 'register' ? 'active' : ''}`} onClick={() => switchMode('register')}>{t('Create an account')}</button>
          </div>}
          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === 'register' && <div className="form-group"><label htmlFor="auth-name">{t('Full name')}</label><input id="auth-name" type="text" name="name" value={form.name} onChange={handleChange} placeholder={t('Your name')} autoComplete="name" /></div>}
            <div className="form-group"><label htmlFor="auth-email">{t('Email address')}</label><input id="auth-email" type="email" name="email" value={form.email} onChange={handleChange} placeholder="votre@email.com" autoComplete="email" /></div>
            {mode === 'login' || mode === 'register' ? <div className="form-group"><label htmlFor="auth-password">{t('Password')}</label><input id="auth-password" type="password" name="password" value={form.password} onChange={handleChange} placeholder={mode === 'register' ? t('Min. 8 characters') : '••••••••'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></div> : null}
            {mode === 'forgot-confirm' && <>
              <div className="form-group"><label htmlFor="auth-code">Code reçu par e-mail</label><input id="auth-code" type="text" name="code" value={form.code} onChange={handleChange} inputMode="numeric" maxLength="6" autoComplete="one-time-code" placeholder="123456" /></div>
              <div className="form-group"><label htmlFor="auth-new-password">Nouveau mot de passe</label><input id="auth-new-password" type="password" name="newPassword" value={form.newPassword} onChange={handleChange} autoComplete="new-password" /></div>
              <div className="form-group"><label htmlFor="auth-confirm-password">Confirmer le mot de passe</label><input id="auth-confirm-password" type="password" name="confirmPassword" value={form.confirmPassword} onChange={handleChange} autoComplete="new-password" /></div>
            </>}
            {error && <div className="auth-error">{error}</div>}
            {notice && <div className="auth-notice">{notice}</div>}
            {mode === 'register' && <p className="auth-helper">{t('Your password must contain at least 8 characters.')}</p>}
            {mode === 'forgot-confirm' && <p className="auth-helper">Le code expire dans 15 minutes et ne peut être utilisé qu’une seule fois.</p>}
            <button type="submit" className="auth-submit" disabled={loading}>{loading ? t('Loading...') : mode === 'login' ? t('Log in') : mode === 'register' ? t('Create my account') : mode === 'forgot-request' ? 'Envoyer le code' : 'Réinitialiser le mot de passe'}</button>
            {mode === 'login' && <button type="button" className="auth-link" onClick={() => switchMode('forgot-request')}>Mot de passe oublié ?</button>}
            {!isAuthMode && <button type="button" className="auth-link" onClick={() => switchMode('login')}>Retour à la connexion</button>}
          </form>
        </div>
      </div>
    </div>
  );
}
