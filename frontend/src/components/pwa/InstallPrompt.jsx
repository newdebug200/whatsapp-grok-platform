import React, { useState, useEffect } from 'react';
import './InstallPrompt.css';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setIsInstalled(true);
      return;
    }

    // Detect iOS
    const ios = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
    setIsIOS(ios);

    // iOS: show manual guide after delay (no beforeinstallprompt on iOS)
    if (ios) {
      const dismissed = sessionStorage.getItem('pwa-ios-dismissed');
      if (!dismissed) {
        setTimeout(() => setVisible(true), 3000);
      }
      return;
    }

    // Android/Desktop: listen for the install prompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      const dismissed = localStorage.getItem('pwa-install-dismissed');
      if (!dismissed) {
        setTimeout(() => setVisible(true), 2000);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
    setVisible(false);
  };

  const handleDismiss = () => {
    setVisible(false);
    if (isIOS) {
      sessionStorage.setItem('pwa-ios-dismissed', '1');
    } else {
      localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    }
  };

  if (!visible || isInstalled) return null;

  return (
    <div className="pwa-banner">
      <div className="pwa-banner-icon">
        <img src="/icons/icon-96.png" alt="SanRobot" />
      </div>
      <div className="pwa-banner-content">
        <div className="pwa-banner-title">Installer SanRobot</div>
        {isIOS ? (
          <div className="pwa-banner-desc">
            Appuyez sur <strong>Partager</strong> puis <strong>"Sur l'écran d'accueil"</strong>
          </div>
        ) : (
          <div className="pwa-banner-desc">
            Installez l'app pour un accès rapide
          </div>
        )}
      </div>
      <div className="pwa-banner-actions">
        {!isIOS && (
          <button className="pwa-install-btn" onClick={handleInstall}>
            Installer
          </button>
        )}
        <button className="pwa-dismiss-btn" onClick={handleDismiss} title="Fermer">
          ✕
        </button>
      </div>
    </div>
  );
}
