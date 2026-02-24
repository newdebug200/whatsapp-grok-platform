import React from 'react';
import './QRCode.css';

function QRCode({ qrCode }) {
  return (
    <div className="qr-container">
      <div className="qr-card">
        <h1>Connexion WhatsApp</h1>
        <p>Scannez ce QR code avec votre WhatsApp pour vous connecter</p>
        
        {qrCode ? (
          <div className="qr-code">
            <img 
              src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCode)}`} 
              alt="QR Code WhatsApp"
            />
          </div>
        ) : (
          <div className="loading">
            <p>Génération du QR code...</p>
            <div className="spinner"></div>
          </div>
        )}
        
        <p className="instructions">
          1. Ouvrez WhatsApp sur votre téléphone<br />
          2. Appuyez sur Menu ou Paramètres<br />
          3. Sélectionnez "Appareils liés"<br />
          4. Scannez ce code
        </p>
      </div>
    </div>
  );
}

export default QRCode;