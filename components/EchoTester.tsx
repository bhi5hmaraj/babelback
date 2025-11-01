"use client"

import React, { useState } from 'react';

interface EchoResponse {
  message: string | null;
  receivedAt: string;
  method: string;
  hasBody: boolean;
  modelId?: string;
  geminiText?: string;
}

const EchoTester: React.FC = () => {
  const [message, setMessage] = useState('Hello from Babelback!');
  const [response, setResponse] = useState<EchoResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedMessage = message.trim();

    if (!trimmedMessage) {
      setError('Please enter a message to send to the API.');
      setResponse(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setStatusMessage(null);

    console.log('[EchoTester] Sending POST to /api/echo with payload:', { message: trimmedMessage });

    try {
      const res = await fetch('/api/echo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: trimmedMessage }),
      });

      if (!res.ok) {
        throw new Error(`Echo request failed with status ${res.status}`);
      }

      const data: EchoResponse = await res.json();
      setResponse(data);
      const summary = `Success: ${data.method} via ${data.modelId ?? 'unknown model'}`;
      setStatusMessage(summary);
      console.log('[EchoTester] Received response from /api/echo', data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error while calling the echo API.';
      setError(message);
      setResponse(null);
      setStatusMessage(null);
      console.error('[EchoTester] Error during POST /api/echo', err);
    } finally {
      setIsLoading(false);
      console.log('[EchoTester] POST /api/echo finished');
    }
  };

  const handlePing = async () => {
    setIsLoading(true);
    setError(null);
    setStatusMessage(null);

    console.log('[EchoTester] Sending GET to /api/echo?message=ping');

    try {
      const res = await fetch('/api/echo?message=ping');
      if (!res.ok) {
        throw new Error(`Echo ping failed with status ${res.status}`);
      }
      const data: EchoResponse = await res.json();
      setResponse(data);
      const summary = `Success: ${data.method} via ${data.modelId ?? 'unknown model'}`;
      setStatusMessage(summary);
      console.log('[EchoTester] Received response from /api/echo', data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error while pinging the echo API.';
      setError(message);
      setResponse(null);
      setStatusMessage(null);
      console.error('[EchoTester] Error during GET /api/echo', err);
    } finally {
      setIsLoading(false);
      console.log('[EchoTester] GET /api/echo finished');
    }
  };

  return (
    <div className="mt-8 border border-slate-700 rounded-lg bg-slate-900/60 p-5 text-left">
      <h3 className="text-xl font-semibold text-sky-300 mb-3">Backend Echo Tester</h3>
      <p className="text-sm text-slate-300 mb-4">
        Use this quick check to confirm the front end can reach the new Vercel serverless function. The handler simply echoes
        your message along with request metadata.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <input
          type="text"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="flex-1 rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
          placeholder="Enter a message to echo"
          aria-label="Message to send to the echo API"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-md transition-colors disabled:opacity-60"
          disabled={isLoading}
        >
          {isLoading ? 'Sending…' : 'Send Message'}
        </button>
        <button
          type="button"
          onClick={handlePing}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-md transition-colors disabled:opacity-60"
          disabled={isLoading}
        >
          {isLoading ? 'Pinging…' : 'Ping (GET)'}
        </button>
      </form>

      {error && (
        <div className="mb-3 p-3 bg-red-900/60 border border-red-700 text-red-200 rounded-md">
          {error}
        </div>
      )}

      {statusMessage && (
        <div className="mb-3 p-3 bg-emerald-900/60 border border-emerald-700 text-emerald-200 rounded-md text-sm">
          {statusMessage}
        </div>
      )}

      {response && (
        <div className="p-3 bg-slate-800/80 border border-slate-700 rounded-md text-sm text-slate-200">
          <p><span className="font-semibold text-sky-300">Message:</span> {response.message ?? '<null>'}</p>
          <p><span className="font-semibold text-sky-300">Method:</span> {response.method}</p>
          {response.modelId && (
            <p><span className="font-semibold text-sky-300">Model:</span> {response.modelId}</p>
          )}
          <p><span className="font-semibold text-sky-300">Received At:</span> {response.receivedAt}</p>
          <p><span className="font-semibold text-sky-300">Body Sent:</span> {response.hasBody ? 'yes' : 'no'}</p>
          {response.geminiText && (
            <p className="mt-2"><span className="font-semibold text-sky-300">Gemini Output:</span> {response.geminiText}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default EchoTester;
