import React from 'react';
import { Mic, MicOff } from 'lucide-react';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { AudioLevelMeter } from './AudioLevelMeter';

interface VoiceInputButtonProps {
  onTranscription: (text: string, isFinal: boolean) => void;
  disabled?: boolean;
  className?: string;
  showAudioLevel?: boolean;
  showLatency?: boolean;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  onTranscription,
  disabled = false,
  className = '',
  showAudioLevel = true,
  showLatency = false
}) => {
  const {
    isListening,
    audioLevel,
    latency,
    error,
    startVoiceInput,
    stopVoiceInput
  } = useVoiceInput({
    onTranscription,
    onError: (err) => {
      console.error('Voice input error:', err);
    }
  });

  const handleClick = () => {
    if (isListening) {
      stopVoiceInput();
    } else {
      startVoiceInput();
    }
  };

  return (
    <div className="voice-input-container">
      <button
        onClick={handleClick}
        disabled={disabled}
        className={`voice-input-button ${className} ${isListening ? 'listening' : ''}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          borderRadius: '8px',
          border: '1px solid #e0e0e0',
          backgroundColor: isListening ? '#e3f2fd' : '#ffffff',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
          opacity: disabled ? 0.5 : 1
        }}
      >
        {isListening ? (
          <MicOff size={20} color="#1976d2" />
        ) : (
          <Mic size={20} color="#666" />
        )}
        <span style={{ fontSize: '14px', fontWeight: 500 }}>
          {isListening ? 'Stop' : 'Start'} Voice Input
        </span>
        {showLatency && latency !== null && (
          <span style={{ 
            fontSize: '12px', 
            color: latency < 600 ? '#4caf50' : '#ff9800',
            marginLeft: '8px'
          }}>
            {latency}ms
          </span>
        )}
      </button>
      
      {showAudioLevel && isListening && (
        <AudioLevelMeter level={audioLevel} isListening={isListening} />
      )}
      
      {error && (
        <div style={{
          marginTop: '8px',
          padding: '8px',
          backgroundColor: '#ffebee',
          color: '#c62828',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          {error.message}
        </div>
      )}
    </div>
  );
};