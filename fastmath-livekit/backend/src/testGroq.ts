import { groqService } from './services/groqService';
import fs from 'fs/promises';
import path from 'path';

async function testGroqTranscription() {
  console.log('Testing Groq transcription service...\n');

  // Check if service is available
  if (!groqService.isAvailable()) {
    console.error('❌ Groq service is not available. Check GROQ_API_KEY.');
    return;
  }

  console.log('✅ Groq service is initialized\n');

  // Create a simple test audio file (you would need an actual audio file)
  // For now, we'll just show the service is ready
  console.log('Service ready for transcription!');
  console.log('\nGroq will accept:');
  console.log('- WebM audio (from LiveKit)');
  console.log('- Direct browser recordings');
  console.log('- No conversion needed!\n');

  // Test number extraction
  const testPhrases = [
    'The answer is three',
    'I think it\'s twenty',
    'Maybe 42',
    'It\'s definitely nine'
  ];

  console.log('Testing number extraction:');
  for (const phrase of testPhrases) {
    const number = groqService.extractNumberFromTranscription(phrase);
    console.log(`"${phrase}" → ${number}`);
  }
}

testGroqTranscription().catch(console.error);