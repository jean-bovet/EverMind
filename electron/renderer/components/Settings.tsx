import React, { useState, useEffect } from 'react';

interface SettingsProps {
  onClose: () => void;
  onOllamaStatusChange: () => void;
}

export default function Settings({ onClose, onOllamaStatusChange }: SettingsProps) {
  const [ollamaModel, setOllamaModel] = useState('mistral');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    loadSettings();
    checkAuth();
  }, []);

  const loadSettings = async () => {
    const settings = await window.electronAPI.getSettings();
    setOllamaModel(settings.ollamaModel || 'mistral');
  };

  const checkAuth = async () => {
    const authenticated = await window.electronAPI.checkEvernoteAuth();
    setIsAuthenticated(authenticated);
  };

  const handleModelChange = async (model: string) => {
    setOllamaModel(model);
    await window.electronAPI.setSetting('ollamaModel', model);
  };

  const handleAuthenticate = async () => {
    setIsAuthenticating(true);
    try {
      await window.electronAPI.authenticateEvernote();
      await checkAuth();
    } catch (error) {
      console.error('Authentication error:', error);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    await window.electronAPI.logoutEvernote();
    await checkAuth();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Settings</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Ollama Settings */}
          <div>
            <h3 style={{ marginBottom: 12, fontSize: 16 }}>Ollama Model</h3>
            <select
              value={ollamaModel}
              onChange={(e) => handleModelChange(e.target.value)}
              style={{
                width: '100%',
                padding: 8,
                background: '#1e1e1e',
                border: '1px solid #444',
                borderRadius: 6,
                color: '#e0e0e0',
                fontSize: 14
              }}
            >
              <option value="mistral">Mistral (Recommended)</option>
              <option value="llama3.1:8b">Llama 3.1 8B</option>
              <option value="mixtral:8x7b">Mixtral 8x7B</option>
              <option value="qwen2.5:14b">Qwen 2.5 14B</option>
            </select>
            <p style={{ fontSize: 12, color: '#888', marginTop: 8 }}>
              Make sure the model is downloaded before using it
            </p>
          </div>

          {/* Evernote Authentication */}
          <div>
            <h3 style={{ marginBottom: 12, fontSize: 16 }}>Evernote Account</h3>
            {isAuthenticated ? (
              <div>
                <div style={{
                  padding: 12,
                  background: '#1e541e',
                  borderRadius: 6,
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}>
                  <span>✅</span>
                  <span>Connected to Evernote</span>
                </div>
                <button
                  className="button button-secondary"
                  onClick={handleLogout}
                  style={{ width: '100%' }}
                >
                  Logout
                </button>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 14, color: '#888', marginBottom: 12 }}>
                  Connect your Evernote account to start importing files
                </p>
                <button
                  className="button button-primary"
                  onClick={handleAuthenticate}
                  disabled={isAuthenticating}
                  style={{ width: '100%' }}
                >
                  {isAuthenticating ? 'Authenticating...' : 'Connect Evernote'}
                </button>
              </div>
            )}
          </div>

          {/* Ollama Status */}
          <div>
            <h3 style={{ marginBottom: 12, fontSize: 16 }}>Ollama Status</h3>
            <button
              className="button button-secondary"
              onClick={onOllamaStatusChange}
              style={{ width: '100%' }}
            >
              Refresh Status
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
