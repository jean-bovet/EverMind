import { useState } from 'react';
import { Loader } from 'lucide-react';

interface WelcomeWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

export default function WelcomeWizard({ onComplete, onSkip }: WelcomeWizardProps) {
  const [isInstalling, setIsInstalling] = useState(false);
  const [step, setStep] = useState<'welcome' | 'installing' | 'model'>('welcome');

  const handleInstallOllama = async () => {
    setIsInstalling(true);
    try {
      const opened = await window.electronAPI.installOllama();
      if (opened) {
        setStep('installing');
      }
    } catch (error) {
      console.error('Error installing Ollama:', error);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleCheckInstallation = async () => {
    const status = await window.electronAPI.checkOllamaInstallation();
    if (status.installed && status.running) {
      setStep('model');
    } else if (status.installed) {
      alert('Ollama is installed but not running. Please start Ollama and click "Check Again"');
    } else {
      alert('Ollama is not installed yet. Please complete the installation and click "Check Again"');
    }
  };

  const handleDownloadModel = async () => {
    const modelName = 'mistral';
    setIsInstalling(true);

    // Subscribe to download progress
    const unsubscribe = window.electronAPI.onModelDownloadProgress((data) => {
      console.log('Model download progress:', data);
      if (data.status === 'complete') {
        unsubscribe();
        onComplete();
      }
    });

    try {
      await window.electronAPI.downloadModel(modelName);
    } catch (error) {
      console.error('Error downloading model:', error);
      unsubscribe();
    } finally {
      setIsInstalling(false);
    }
  };

  if (step === 'welcome') {
    return (
      <div className="welcome-wizard">
        <div style={{ fontSize: 64, marginBottom: 24 }}>🚀</div>
        <h2>Welcome to Evernote AI Importer</h2>
        <p>
          This app uses Ollama to analyze your files locally with AI.
          Let's get you set up in just a few steps.
        </p>

        <div className="wizard-steps">
          <div className="wizard-step">
            <div className="wizard-step-title">1. Install Ollama</div>
            <div className="wizard-step-description">
              Ollama is free and open-source. All processing happens locally on your machine for complete privacy.
            </div>
          </div>
          <div className="wizard-step">
            <div className="wizard-step-title">2. Download AI Model</div>
            <div className="wizard-step-description">
              Choose an AI model (we recommend Mistral, ~4GB). Models are downloaded only once.
            </div>
          </div>
          <div className="wizard-step">
            <div className="wizard-step-title">3. Connect Evernote</div>
            <div className="wizard-step-description">
              Securely connect to your Evernote account to start importing files.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            className="button button-primary"
            onClick={handleInstallOllama}
            disabled={isInstalling}
          >
            {isInstalling ? 'Opening...' : 'Install Ollama'}
          </button>
          <button
            className="button button-secondary"
            onClick={onSkip}
          >
            Skip Setup
          </button>
        </div>
      </div>
    );
  }

  if (step === 'installing') {
    return (
      <div className="welcome-wizard">
        <div style={{ marginBottom: 24 }}>
          <Loader className="animate-spin" size={64} />
        </div>
        <h2>Installing Ollama</h2>
        <p>
          Follow the installation instructions in your browser.
          Once you've completed the installation and Ollama is running, click "Check Again" below.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 32 }}>
          <button
            className="button button-primary"
            onClick={handleCheckInstallation}
          >
            Check Again
          </button>
          <button
            className="button button-secondary"
            onClick={onSkip}
          >
            I'll Do This Later
          </button>
        </div>
      </div>
    );
  }

  if (step === 'model') {
    return (
      <div className="welcome-wizard">
        <div style={{ fontSize: 64, marginBottom: 24 }}>✨</div>
        <h2>Download AI Model</h2>
        <p>
          Ollama is ready! Now let's download the Mistral model (~4GB).
          This will take a few minutes depending on your connection.
        </p>

        <div className="wizard-steps">
          <div className="wizard-step">
            <div className="wizard-step-title">Mistral (Recommended)</div>
            <div className="wizard-step-description">
              Fast and efficient, great for document analysis. Size: ~4GB
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 32 }}>
          <button
            className="button button-primary"
            onClick={handleDownloadModel}
            disabled={isInstalling}
          >
            {isInstalling ? 'Downloading...' : 'Download Mistral'}
          </button>
          <button
            className="button button-secondary"
            onClick={onComplete}
          >
            I Already Have a Model
          </button>
        </div>
      </div>
    );
  }

  return null;
}
