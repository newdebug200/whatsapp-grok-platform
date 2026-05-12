import React, { useState, useEffect } from 'react';
import './InstallPrompt.css';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setIsInstalled(true);
      return;
    }

    const ios = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
    setIsIOS(ios);

    if (!ios) {
      const handler = (e) => {
        e.preventDefault();
        setDeferredPrompt(e);
        const dismissed = localStorage.getItem('pwa-banner-dismissed');
        if (!dismissed) {
          setTimeout(() => setShowBanner(true), 2000);
        }
      };
      window.addEventListener('beforeinstallprompt', handler);
      return () => window.removeEventListener('beforeinstallprompt', handler);
    }
  }, []);

  const handleInstall = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
      setShowBanner(false);
      return;
    }
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
    setShowBanner(false);
  };

  const handleFabClick = () => {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }
    if (deferredPrompt) {
      handleInstall();
    }
  };

  const handleDismissBanner = () => {
    setShowBanner(false);
    localStorage.setItem('pwa-banner-dismissed', Date.now().toString());
  };

  if (isInstalled) return null;

  const showFab = isIOS || deferredPrompt !== null;

  return (
    <>
      {showFab && (
        <button
          className="pwa-fab"
          onClick={handleFabClick}
          title="Installer Botora"
          aria-label="Installer l'application"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5v-2z"/>
          </svg>
          <span>Installer</span>
        </button>
      )}

      {showBanner && (
        <div className="pwa-banner">
          <div className="pwa-banner-icon">
            <img src="/icons/icon-96.png" alt="Botora" />
          </div>
          <div className="pwa-banner-content">
            <div className="pwa-banner-title">Installer Botora</div>
            <div className="pwa-banner-desc">Installez l'app pour un accès rapide depuis votre écran d'accueil</div>
          </div>
          <div className="pwa-banner-actions">
            <button className="pwa-install-btn" onClick={handleInstall}>Installer</button>
            <button className="pwa-dismiss-btn" onClick={handleDismissBanner} title="Fermer">✕</button>
          </div>
        </div>
      )}

      {showIOSGuide && (
        <div className="pwa-ios-overlay" onClick={() => setShowIOSGuide(false)}>
          <div className="pwa-ios-card" onClick={e => e.stopPropagation()}>
            <div className="pwa-ios-header">
              <img src="/icons/icon-96.png" alt="Botora" />
              <div>
                <div className="pwa-ios-title">Installer Botora</div>
                <div className="pwa-ios-sub">sur votre iPhone / iPad</div>
              </div>
              <button className="pwa-ios-close" onClick={() => setShowIOSGuide(false)}>✕</button>
            </div>
            <div className="pwa-ios-steps">
              <div className="pwa-ios-step">
                <span className="pwa-ios-num">1</span>
                <span>Appuyez sur <strong>Partager</strong> <span className="pwa-ios-icon">⎙</span> en bas de Safari</span>
              </div>
              <div className="pwa-ios-step">
                <span className="pwa-ios-num">2</span>
                <span>Faites défiler et choisissez <strong>"Sur l'écran d'accueil"</strong></span>
              </div>
              <div className="pwa-ios-step">
                <span className="pwa-ios-num">3</span>
                <span>Appuyez sur <strong>Ajouter</strong> en haut à droite</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
