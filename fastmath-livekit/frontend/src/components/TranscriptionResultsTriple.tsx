import * as React from "react"

export interface TranscriptionData {
  problem: string;
  correctAnswer: number;
  webSpeechTranscript: string | null;
  deepgramTranscript: string | null;
  groqTranscript?: string | null;
  webSpeechLatency: number | null;
  deepgramLatency: number | null;
  groqLatency?: number | null;
  webSpeechProblemLatency?: number | null;
  deepgramProblemLatency?: number | null;
  groqProblemLatency?: number | null;
}

interface TranscriptionResultsProps {
  results: TranscriptionData[];
  sessionComplete: boolean;
}

export const TranscriptionResults: React.FC<TranscriptionResultsProps> = ({ results, sessionComplete }) => {
  if (!sessionComplete || results.length === 0) {
    return null;
  }

  // Calculate average latencies
  const webSpeechRecognitionLatencies = results
    .filter(r => r.webSpeechLatency !== null)
    .map(r => r.webSpeechLatency!);
  const deepgramLatencies = results
    .filter(r => r.deepgramLatency !== null)
    .map(r => r.deepgramLatency!);
  const groqLatencies = results
    .filter(r => r.groqLatency !== null && r.groqLatency !== undefined)
    .map(r => r.groqLatency!);
  
  // Calculate average response times from problem display
  const webSpeechProblemLatencies = results
    .filter(r => r.webSpeechProblemLatency !== null)
    .map(r => r.webSpeechProblemLatency!);
  const deepgramProblemLatencies = results
    .filter(r => (r.deepgramProblemLatency || r.deepgramLatency) !== null)
    .map(r => r.deepgramProblemLatency || r.deepgramLatency!);
  const groqProblemLatencies = results
    .filter(r => (r.groqProblemLatency || r.groqLatency) !== null)
    .map(r => r.groqProblemLatency || r.groqLatency!);
  
  const avgWebSpeechRecognitionLatency = webSpeechRecognitionLatencies.length > 0 
    ? webSpeechRecognitionLatencies.reduce((a, b) => a + b, 0) / webSpeechRecognitionLatencies.length 
    : null;
    
  const avgWebSpeechProblemLatency = webSpeechProblemLatencies.length > 0
    ? webSpeechProblemLatencies.reduce((a, b) => a + b, 0) / webSpeechProblemLatencies.length
    : null;
    
  const avgDeepgramProblemLatency = deepgramProblemLatencies.length > 0
    ? deepgramProblemLatencies.reduce((a, b) => a + b, 0) / deepgramProblemLatencies.length
    : null;
    
  const avgGroqProblemLatency = groqProblemLatencies.length > 0
    ? groqProblemLatencies.reduce((a, b) => a + b, 0) / groqProblemLatencies.length
    : null;

  return (
    <div className="mt-8 p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6">Transcription Comparison Results</h2>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Problem
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Correct Answer
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <span className="text-blue-600">Web Speech API</span>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <span className="text-purple-600">Deepgram</span>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <span className="text-orange-600">Groq/Whisper</span>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <span className="text-blue-600">Web Speech Latency</span><br />
                <span className="text-xs text-gray-400">(from speech start)</span>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <span className="text-purple-600">Deepgram Latency</span><br />
                <span className="text-xs text-gray-400">(from speech start)</span>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <span className="text-orange-600">Groq Latency</span><br />
                <span className="text-xs text-gray-400">(from speech start)</span>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                First Response Time<br />
                <span className="text-xs text-gray-400">(from problem display)</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {results.map((result, index) => {
              const webSpeechCorrect = result.webSpeechTranscript === result.correctAnswer.toString();
              const deepgramCorrect = result.deepgramTranscript === result.correctAnswer.toString();
              const groqCorrect = result.groqTranscript === result.correctAnswer.toString();
              
              return (
                <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {result.problem}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">
                    {result.correctAnswer}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      webSpeechCorrect 
                        ? 'bg-green-100 text-green-800' 
                        : result.webSpeechTranscript 
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                    }`}>
                      <span className="text-blue-600 font-semibold">
                        {result.webSpeechTranscript || 'No input'}
                      </span>
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      deepgramCorrect 
                        ? 'bg-green-100 text-green-800' 
                        : result.deepgramTranscript 
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                    }`}>
                      <span className="text-purple-600 font-semibold">
                        {result.deepgramTranscript || 'No input'}
                      </span>
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      groqCorrect 
                        ? 'bg-green-100 text-green-800' 
                        : result.groqTranscript 
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                    }`}>
                      <span className="text-orange-600 font-semibold">
                        {result.groqTranscript || 'No input'}
                      </span>
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className="text-blue-600 font-medium">
                      {result.webSpeechLatency !== null ? `${result.webSpeechLatency}ms` : 'N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className="text-purple-600 font-medium">
                      {result.deepgramLatency !== null ? `${result.deepgramLatency}ms` : 'N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className="text-orange-600 font-medium">
                      {result.groqLatency !== null && result.groqLatency !== undefined ? `${result.groqLatency}ms` : 'N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {(() => {
                      const webProblemLatency = result.webSpeechProblemLatency;
                      const deepProblemLatency = result.deepgramProblemLatency;
                      const groqProblemLatency = result.groqProblemLatency;
                      
                      const isValid = (value: number | null | undefined): value is number => {
                        return value !== null && value !== undefined && !isNaN(value);
                      };
                      
                      const latencies: Array<{ value: number; color: string }> = [];
                      if (isValid(webProblemLatency)) latencies.push({ value: webProblemLatency, color: 'text-blue-600' });
                      if (isValid(deepProblemLatency)) latencies.push({ value: deepProblemLatency, color: 'text-purple-600' });
                      if (isValid(groqProblemLatency)) latencies.push({ value: groqProblemLatency, color: 'text-orange-600' });
                      
                      if (latencies.length === 0) {
                        return <span className="text-gray-400">N/A</span>;
                      }
                      
                      const fastest = latencies.reduce((min, curr) => curr.value < min.value ? curr : min);
                      return (
                        <span className={`${fastest.color} font-medium`}>
                          {fastest.value}ms
                        </span>
                      );
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary Statistics */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-blue-800 mb-2">Web Speech API Summary</h3>
          <div className="space-y-1 text-sm">
            <p>
              Accuracy: {' '}
              <span className="font-semibold">
                {results.filter(r => r.webSpeechTranscript === r.correctAnswer.toString()).length} / {results.length}
                {' '}({((results.filter(r => r.webSpeechTranscript === r.correctAnswer.toString()).length / results.length) * 100).toFixed(1)}%)
              </span>
            </p>
            <p>
              Avg Latency: {' '}
              <span className="font-semibold text-blue-600">
                {avgWebSpeechRecognitionLatency !== null ? `${avgWebSpeechRecognitionLatency.toFixed(0)}ms` : 'N/A'}
              </span>
            </p>
            <p>
              Response Time: {' '}
              <span className="font-semibold text-blue-600">
                {avgWebSpeechProblemLatency !== null ? `${avgWebSpeechProblemLatency.toFixed(0)}ms` : 'N/A'}
              </span>
            </p>
          </div>
        </div>

        <div className="bg-purple-50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-purple-800 mb-2">Deepgram Summary</h3>
          <div className="space-y-1 text-sm">
            <p>
              Accuracy: {' '}
              <span className="font-semibold">
                {results.filter(r => r.deepgramTranscript === r.correctAnswer.toString()).length} / {results.length}
                {' '}({((results.filter(r => r.deepgramTranscript === r.correctAnswer.toString()).length / results.length) * 100).toFixed(1)}%)
              </span>
            </p>
            <p>
              Avg Latency: {' '}
              <span className="font-semibold text-purple-600">
                {(() => {
                  const deepgramLatencies = results
                    .filter(r => r.deepgramLatency !== null)
                    .map(r => r.deepgramLatency!);
                  return deepgramLatencies.length > 0
                    ? `${(deepgramLatencies.reduce((a, b) => a + b, 0) / deepgramLatencies.length).toFixed(0)}ms`
                    : 'N/A';
                })()}
              </span>
            </p>
            <p>
              Response Time: {' '}
              <span className="font-semibold text-purple-600">
                {avgDeepgramProblemLatency !== null ? `${avgDeepgramProblemLatency.toFixed(0)}ms` : 'N/A'}
              </span>
            </p>
          </div>
        </div>

        <div className="bg-orange-50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-orange-800 mb-2">Groq/Whisper Summary</h3>
          <div className="space-y-1 text-sm">
            <p>
              Accuracy: {' '}
              <span className="font-semibold">
                {results.filter(r => r.groqTranscript === r.correctAnswer.toString()).length} / {results.length}
                {' '}({((results.filter(r => r.groqTranscript === r.correctAnswer.toString()).length / results.length) * 100).toFixed(1)}%)
              </span>
            </p>
            <p>
              Avg Latency: {' '}
              <span className="font-semibold text-orange-600">
                {(() => {
                  const groqLatencies = results
                    .filter(r => r.groqLatency !== null && r.groqLatency !== undefined)
                    .map(r => r.groqLatency!);
                  return groqLatencies.length > 0
                    ? `${(groqLatencies.reduce((a, b) => a + b, 0) / groqLatencies.length).toFixed(0)}ms`
                    : 'N/A';
                })()}
              </span>
            </p>
            <p>
              Response Time: {' '}
              <span className="font-semibold text-orange-600">
                {avgGroqProblemLatency !== null ? `${avgGroqProblemLatency.toFixed(0)}ms` : 'N/A'}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Comparison Winner */}
      <div className="mt-4 p-4 bg-gray-50 rounded-lg text-center">
        <p className="text-lg">
          {(() => {
            const webAccuracy = results.filter(r => r.webSpeechTranscript === r.correctAnswer.toString()).length;
            const deepgramAccuracy = results.filter(r => r.deepgramTranscript === r.correctAnswer.toString()).length;
            const groqAccuracy = results.filter(r => r.groqTranscript === r.correctAnswer.toString()).length;
            
            const maxAccuracy = Math.max(webAccuracy, deepgramAccuracy, groqAccuracy);
            const winners = [];
            
            if (webAccuracy === maxAccuracy) winners.push({ name: 'Web Speech API', color: 'text-blue-600' });
            if (deepgramAccuracy === maxAccuracy) winners.push({ name: 'Deepgram', color: 'text-purple-600' });
            if (groqAccuracy === maxAccuracy) winners.push({ name: 'Groq/Whisper', color: 'text-orange-600' });
            
            if (winners.length === 1) {
              return <span className={`${winners[0].color} font-bold`}>{winners[0].name} had the best accuracy</span>;
            } else if (winners.length === 2) {
              return <span className="text-gray-600 font-bold">{winners.map(w => w.name).join(' and ')} tied for best accuracy</span>;
            } else {
              return <span className="text-gray-600 font-bold">All services had equal accuracy</span>;
            }
          })()}
        </p>
        {(() => {
          const validLatencies: Array<{ name: string; value: number; color: string }> = [];
          if (avgWebSpeechProblemLatency !== null) validLatencies.push({ name: 'Web Speech API', value: avgWebSpeechProblemLatency, color: 'text-blue-600' });
          if (avgDeepgramProblemLatency !== null) validLatencies.push({ name: 'Deepgram', value: avgDeepgramProblemLatency, color: 'text-purple-600' });
          if (avgGroqProblemLatency !== null) validLatencies.push({ name: 'Groq/Whisper', value: avgGroqProblemLatency, color: 'text-orange-600' });
          
          if (validLatencies.length >= 2) {
            const fastest = validLatencies.reduce((min, curr) => curr.value < min.value ? curr : min);
            const slowest = validLatencies.reduce((max, curr) => curr.value > max.value ? curr : max);
            const difference = slowest.value - fastest.value;
            
            return (
              <p className="text-sm text-gray-600 mt-2">
                <span className={fastest.color}>{fastest.name} was {difference.toFixed(0)}ms faster than {slowest.name} on average</span>
              </p>
            );
          }
          return null;
        })()}
      </div>
    </div>
  );
};