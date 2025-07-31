import * as React from "react"

export interface TranscriptionData {
  problem: string;
  correctAnswer: number;
  webSpeechTranscript: string | null;
  deepgramTranscript: string | null;
  webSpeechLatency: number | null; // in milliseconds from speech start
  deepgramLatency: number | null; // in milliseconds from problem display
  webSpeechProblemLatency?: number | null; // in milliseconds from problem display
  deepgramProblemLatency?: number | null; // in milliseconds from problem display
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
  
  // Calculate average response times from problem display
  const webSpeechProblemLatencies = results
    .filter(r => r.webSpeechProblemLatency !== null)
    .map(r => r.webSpeechProblemLatency!);
  const deepgramProblemLatencies = results
    .filter(r => (r.deepgramProblemLatency || r.deepgramLatency) !== null)
    .map(r => r.deepgramProblemLatency || r.deepgramLatency!);
  
  const avgWebSpeechRecognitionLatency = webSpeechRecognitionLatencies.length > 0 
    ? webSpeechRecognitionLatencies.reduce((a, b) => a + b, 0) / webSpeechRecognitionLatencies.length 
    : null;
  
  const avgDeepgramLatency = deepgramLatencies.length > 0
    ? deepgramLatencies.reduce((a, b) => a + b, 0) / deepgramLatencies.length
    : null;
    
  const avgWebSpeechProblemLatency = webSpeechProblemLatencies.length > 0
    ? webSpeechProblemLatencies.reduce((a, b) => a + b, 0) / webSpeechProblemLatencies.length
    : null;
    
  const avgDeepgramProblemLatency = deepgramProblemLatencies.length > 0
    ? deepgramProblemLatencies.reduce((a, b) => a + b, 0) / deepgramProblemLatencies.length
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
                <span className="text-blue-600">Web Speech Latency</span>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <span className="text-purple-600">Deepgram Latency</span>
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
                    {(() => {
                      const webProblemLatency = result.webSpeechProblemLatency;
                      const deepProblemLatency = result.deepgramProblemLatency || result.deepgramLatency;
                      
                      if (webProblemLatency !== null && webProblemLatency !== undefined && deepProblemLatency !== null && deepProblemLatency !== undefined) {
                        // Both have latencies, show the lower one
                        if (webProblemLatency < deepProblemLatency) {
                          return (
                            <span className="text-blue-600 font-medium">
                              {webProblemLatency}ms
                            </span>
                          );
                        } else {
                          return (
                            <span className="text-purple-600 font-medium">
                              {deepProblemLatency}ms
                            </span>
                          );
                        }
                      } else if (webProblemLatency !== null) {
                        // Only Web Speech has latency
                        return (
                          <span className="text-blue-600 font-medium">
                            {webProblemLatency}ms
                          </span>
                        );
                      } else if (deepProblemLatency !== null) {
                        // Only Deepgram has latency
                        return (
                          <span className="text-purple-600 font-medium">
                            {deepProblemLatency}ms
                          </span>
                        );
                      } else {
                        // Neither has latency
                        return <span className="text-gray-400">N/A</span>;
                      }
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary Statistics */}
      <div className="mt-6 grid grid-cols-2 gap-4">
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
              Recognition Latency: {' '}
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
              Response Time: {' '}
              <span className="font-semibold text-purple-600">
                {avgDeepgramProblemLatency !== null ? `${avgDeepgramProblemLatency.toFixed(0)}ms` : 'N/A'}
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
            
            if (webAccuracy > deepgramAccuracy) {
              return <span className="text-blue-600 font-bold">Web Speech API had better accuracy</span>;
            } else if (deepgramAccuracy > webAccuracy) {
              return <span className="text-purple-600 font-bold">Deepgram had better accuracy</span>;
            } else {
              return <span className="text-gray-600 font-bold">Both services had equal accuracy</span>;
            }
          })()}
        </p>
        {avgWebSpeechProblemLatency !== null && avgDeepgramProblemLatency !== null && (
          <p className="text-sm text-gray-600 mt-2">
            {avgWebSpeechProblemLatency < avgDeepgramProblemLatency
              ? <span className="text-blue-600">Web Speech API was {(avgDeepgramProblemLatency - avgWebSpeechProblemLatency).toFixed(0)}ms faster on average</span>
              : <span className="text-purple-600">Deepgram was {(avgWebSpeechProblemLatency - avgDeepgramProblemLatency).toFixed(0)}ms faster on average</span>
            }
          </p>
        )}
      </div>
    </div>
  );
};